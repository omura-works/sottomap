-- 0015_name_context_and_deletion_log.sql（docs/SPEC.md §9.18-1・§9.17、最終レビュー R22 重要2・決定事項）を検証する pgTAP テスト。
--
--   1. 表示名: 並びの検査の関数がある（規則と一覧は 0016 で改め、supabase/tests/0016_display_name_server_only.sql に移した）。
--   2. 退会の記録: delete_account が account_deletion_log に書く。reapply_account_deletions() がバックアップから
--      戻した後のアカウントを再び削除する。purge_expired_account_deletion_log() が30日を過ぎた記録を消す。
--   3. 権限: 記録の表は利用者から読めず書けない（service_role は読むだけ）。運営用 RPC は service_role のみ、
--      内部関数は誰にも実行させない。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 見えない文字は chr() で作る（ファイルに直接書かない）。最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

-- =========================================================
-- テストデータ（postgres として作成）
--   P: 表示名を変える人
--   Q: 退会する人（投稿・問い合わせを持つ） / R: 退会しない人
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('f4150000-0000-4000-8000-000000000001', 'r22-test-city-1', 'R22街1', 'あーるにじゅうにまち1', false, 43.06, 141.35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('a4150000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r22-p@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4150000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r22-q@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4150000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r22-r@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, lantern_points) values
  ('a4150000-0000-4000-8000-000000000001', 'R22P', 'f4150000-0000-4000-8000-000000000001', 0),
  ('a4150000-0000-4000-8000-000000000002', 'R22Q', 'f4150000-0000-4000-8000-000000000001', 0),
  ('a4150000-0000-4000-8000-000000000003', 'R22R', 'f4150000-0000-4000-8000-000000000001', 0);

insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('b4150000-0000-4000-8000-000000000002', 'f4150000-0000-4000-8000-000000000001', 'R22-Q の店', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', 'a4150000-0000-4000-8000-000000000002', 'published', now() - interval '1 day', now() - interval '1 day');

insert into contact_messages (category, message, reply_to, requester_id) values
  ('privacy', 'R22: Q がログイン中に送った請求', null, 'a4150000-0000-4000-8000-000000000002');

-- =========================================================
-- 1. 表示名の見えない文字の並び（R22 重要2）
--    （0016 で規則を改め、一覧は supabase/tests/0016_display_name_server_only.sql に移した）
-- =========================================================
select has_function('public', 'display_name_has_invisible_sequence', array['text'], '関数 display_name_has_invisible_sequence(text) がある');

-- 0016（R23 重要1）で規則を単純にし（ZWNJ は全面禁止・タグ文字は3つの旗だけ）、set_display_name を service_role 専用に
-- した。受け付ける名前・拒否する名前の一覧は supabase/tests/0016_display_name_server_only.sql に移した
-- （src/lib/domain/display-name.cases.ts と同じ一覧）。ここでは並びの検査の関数があることだけを見る。

select ok(
  not public.display_name_has_invisible_sequence('灯りの人')
  and public.display_name_has_invisible_sequence(''),
  'display_name_has_invisible_sequence: 普通の名前は false、空（見える文字が無い）は true'
);

-- =========================================================
-- 2. 退会の記録（R22 決定事項）
-- =========================================================
select has_table('public', 'account_deletion_log', '表 account_deletion_log がある');
select col_is_pk('public', 'account_deletion_log', 'user_id', 'account_deletion_log の主キーは user_id');
select col_not_null('public', 'account_deletion_log', 'deleted_at', 'account_deletion_log.deleted_at は NOT NULL');
select is(
  (select count(*)::int from pg_catalog.pg_constraint c
   where c.conrelid = 'public.account_deletion_log'::regclass and c.contype = 'f'),
  0,
  'account_deletion_log は auth.users への外部キーを持たない（消したアカウントの ID を残す）'
);
select ok(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.account_deletion_log'::regclass),
  'account_deletion_log は RLS が有効'
);
select is_empty(
  $$
    with roles(role_name, allowed) as (values
      ('public', array[]::text[]), ('anon', array[]::text[]), ('authenticated', array[]::text[]),
      ('service_role', array['SELECT'])
    ),
    privs(priv) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'))
    select r.role_name, p.priv
    from roles r cross join privs p
    where has_table_privilege(r.role_name, 'public.account_deletion_log', p.priv) <> (p.priv = any (r.allowed))
  $$,
  '権限表: account_deletion_log は利用者から読めず書けず、service_role は読むだけ'
);
select is_empty(
  $$
    with fns(fn, service_ok) as (values
      ('public.delete_account(uuid)', true),
      ('public.reapply_account_deletions()', true),
      ('public.purge_expired_account_deletion_log()', true),
      ('public.display_name_is_pictographic(integer)', false),
      ('public.display_name_has_invisible_sequence(text)', false)
    )
    select f.fn, e.role_name
    from fns f
    cross join lateral (values
      ('public', false), ('anon', false), ('authenticated', false), ('service_role', f.service_ok)
    ) as e(role_name, allowed)
    where has_function_privilege(e.role_name, f.fn, 'EXECUTE') <> e.allowed
  $$,
  '権限表: 退会の運営用 RPC は service_role のみ、表示名の内部関数は誰にも実行させない'
);
select is(
  (select pg_catalog.array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   where p.oid in ('public.reapply_account_deletions()'::regprocedure,
                   'public.purge_expired_account_deletion_log()'::regprocedure,
                   'public.delete_account(uuid)'::regprocedure)
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  array['delete_account', 'purge_expired_account_deletion_log', 'reapply_account_deletions'],
  '退会の運営用 RPC は security definer・search_path 空'
);

-- 2-1. 利用者（authenticated・anon）は記録を読めず、運営用 RPC も実行できない。
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4150000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select count(*) from public.account_deletion_log $$, '42501', null, '本人（authenticated）は退会の記録を読めない');
select throws_ok($$ select public.reapply_account_deletions() $$, '42501', null, '本人（authenticated）は reapply_account_deletions を実行できない');
select throws_ok($$ select public.purge_expired_account_deletion_log() $$, '42501', null, '本人（authenticated）は purge_expired_account_deletion_log を実行できない');
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select count(*) from public.account_deletion_log $$, '42501', null, '未ログイン（anon）は退会の記録を読めない');
reset role;

-- 2-2. delete_account が記録を書く。
set local role service_role;
select is(public.reapply_account_deletions(), 0, 'reapply_account_deletions: 記録が無ければ何も消さない（0件）');
select lives_ok(
  $$ select public.delete_account('a4150000-0000-4000-8000-000000000002') $$,
  'delete_account: 運営（service_role）が Q を退会させる'
);
select results_eq(
  $$ select user_id, deleted_at from public.account_deletion_log $$,
  $$ values ('a4150000-0000-4000-8000-000000000002'::uuid, now()) $$,
  'delete_account は account_deletion_log に ID と日時を書く（service_role は読める）'
);
select throws_ok(
  $$ insert into public.account_deletion_log (user_id) values ('a4150000-0000-4000-8000-0000000000ff') $$,
  '42501', null,
  'service_role も記録を直接は書けない（書くのは関数だけ）'
);
select throws_ok(
  $$ select public.delete_account('a4150000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'アカウントが見つかりませんでした',
  'delete_account: 存在しないアカウントは「見つからない」'
);
select is(
  (select count(*)::int from public.account_deletion_log),
  1,
  '見つからなかった退会は記録しない'
);
reset role;

-- 2-3. バックアップから戻した（Q のアカウント・プロフィール・店・問い合わせが戻った）とみなし、再び削除する。
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('a4150000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r22-q@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);
insert into users (id, display_name, home_city_id, lantern_points) values
  ('a4150000-0000-4000-8000-000000000002', 'R22Q', 'f4150000-0000-4000-8000-000000000001', 0);
insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('b4150000-0000-4000-8000-000000000002', 'f4150000-0000-4000-8000-000000000001', 'R22-Q の店', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', 'a4150000-0000-4000-8000-000000000002', 'published', now() - interval '1 day', now() - interval '1 day');
insert into contact_messages (category, message, reply_to, requester_id) values
  ('privacy', 'R22: Q がログイン中に送った請求', null, 'a4150000-0000-4000-8000-000000000002');

set local role service_role;
select is(public.reapply_account_deletions(), 1, 'reapply_account_deletions: 記録にある Q を再び削除し、件数（1）を返す');
reset role;

select is(
  (select count(*)::int from auth.users where id = 'a4150000-0000-4000-8000-000000000002'),
  0, '再削除の後: Q の auth.users の行は無い'
);
select is(
  (select count(*)::int from users where id = 'a4150000-0000-4000-8000-000000000002')
  + (select count(*)::int from spots where author_id = 'a4150000-0000-4000-8000-000000000002')
  + (select count(*)::int from contact_messages where requester_id = 'a4150000-0000-4000-8000-000000000002'),
  0, '再削除の後: Q のプロフィール・店・ログイン中に送った問い合わせも無い（cascade）'
);
select is(
  (select count(*)::int from auth.users where id in ('a4150000-0000-4000-8000-000000000001', 'a4150000-0000-4000-8000-000000000003')),
  2, '再削除は記録に無いアカウント（P・R）を消さない'
);

-- 2-4. 30日を過ぎた記録を消す（ちょうど30日は残す）。
insert into public.account_deletion_log (user_id, deleted_at) values
  ('a4150000-0000-4000-8000-0000000000a1', now() - interval '31 days'),
  ('a4150000-0000-4000-8000-0000000000a2', now() - interval '30 days 1 second'),
  ('a4150000-0000-4000-8000-0000000000a3', now() - interval '30 days'),
  ('a4150000-0000-4000-8000-0000000000a4', now() - interval '29 days');

set local role service_role;
select is(public.purge_expired_account_deletion_log(), 2, 'purge_expired_account_deletion_log: 30日を過ぎた2件を消し、件数を返す');
select results_eq(
  $$ select user_id from public.account_deletion_log order by user_id $$,
  $$ values ('a4150000-0000-4000-8000-000000000002'::uuid),
            ('a4150000-0000-4000-8000-0000000000a3'::uuid),
            ('a4150000-0000-4000-8000-0000000000a4'::uuid) $$,
  '30日ちょうど・30日以内の記録は残る'
);
select is(public.purge_expired_account_deletion_log(), 0, 'purge_expired_account_deletion_log は冪等（2回目は0件）');
reset role;

-- 2-5. 同じアカウントをもう一度退会させたら（戻した後に運営が手で消したなど）、日時は新しい方になる。
update public.account_deletion_log set deleted_at = now() - interval '10 days'
where user_id = 'a4150000-0000-4000-8000-000000000002';
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('a4150000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r22-q@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);
set local role service_role;
select lives_ok(
  $$ select public.delete_account('a4150000-0000-4000-8000-000000000002') $$,
  'delete_account: 記録のあるアカウントをもう一度消せる'
);
select is(
  (select deleted_at from public.account_deletion_log where user_id = 'a4150000-0000-4000-8000-000000000002'),
  now(),
  '二度目の退会では、記録の日時を新しい方にする（バックアップの保存期間を数え直す）'
);
reset role;

select * from finish();

rollback;
