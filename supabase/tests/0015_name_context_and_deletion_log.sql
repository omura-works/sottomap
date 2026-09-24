-- 0015_name_context_and_deletion_log.sql（docs/SPEC.md §9.18-1・§9.17、最終レビュー R22 重要2・決定事項）を検証する pgTAP テスト。
--
--   1. 表示名: ZWJ・ZWNJ・タグ文字は正しい並びの中だけ使える。見える文字が1つも無い名前は不可
--      （src/lib/domain/display-name.test.ts と同じ入力・同じ結果）。
--   2. 退会の記録: delete_account が account_deletion_log に書く。reapply_account_deletions() がバックアップから
--      戻した後のアカウントを再び削除する。purge_expired_account_deletion_log() が30日を過ぎた記録を消す。
--   3. 権限: 記録の表は利用者から読めず書けない（service_role は読むだけ）。運営用 RPC は service_role のみ、
--      内部関数は誰にも実行させない。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 見えない文字は chr() で作る（ファイルに直接書かない）。最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(67);

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
--    受け付ける11件・拒否する24件は src/lib/domain/display-name.test.ts と同じ入力。
-- =========================================================
select has_function('public', 'display_name_has_invisible_sequence', array['text'], '関数 display_name_has_invisible_sequence(text) がある');

set local role authenticated;
set local request.jwt.claims to '{"sub":"a4150000-0000-4000-8000-000000000001","role":"authenticated"}';

select is(set_display_name(chr(128104) || chr(8205) || chr(128105) || chr(8205) || chr(128103) || chr(8205) || chr(128102)), chr(128104) || chr(8205) || chr(128105) || chr(8205) || chr(128103) || chr(8205) || chr(128102), 'set_display_name: 家族の絵文字（ZWJ） は使える');
select is(set_display_name(chr(129489) || chr(8205) || chr(127859)), chr(129489) || chr(8205) || chr(127859), 'set_display_name: 職業の絵文字（ZWJ） は使える');
select is(set_display_name(chr(129489) || chr(127997) || chr(8205) || chr(128658)), chr(129489) || chr(127997) || chr(8205) || chr(128658), 'set_display_name: 肌の色を付けた職業の絵文字（修飾子の後の ZWJ） は使える');
select is(set_display_name(chr(127987) || chr(65039) || chr(8205) || chr(127752)), chr(127987) || chr(65039) || chr(8205) || chr(127752), 'set_display_name: VS16 の後の ZWJ（レインボーフラッグ） は使える');
select is(set_display_name(chr(10084) || chr(65039) || chr(8205) || chr(128293) || 'の人'), chr(10084) || chr(65039) || chr(8205) || chr(128293) || 'の人', 'set_display_name: ハートに火（VS16 の後の ZWJ） は使える');
select is(set_display_name(chr(127988) || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || chr(917631) || '灯り'), chr(127988) || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || chr(917631) || '灯り', 'set_display_name: イングランドの旗（タグ列） は使える');
select is(set_display_name(chr(127988) || chr(917607) || chr(917602) || chr(917619) || chr(917603) || chr(917620) || chr(917631) || chr(127988) || chr(917607) || chr(917602) || chr(917619) || chr(917603) || chr(917620) || chr(917631)), chr(127988) || chr(917607) || chr(917602) || chr(917619) || chr(917603) || chr(917620) || chr(917631) || chr(127988) || chr(917607) || chr(917602) || chr(917619) || chr(917603) || chr(917620) || chr(917631), 'set_display_name: スコットランドの旗を2つ並べる は使える');
select is(set_display_name(chr(1605) || chr(1740) || chr(8204) || chr(1582) || chr(1608) || chr(1575) || chr(1607) || chr(1605)), chr(1605) || chr(1740) || chr(8204) || chr(1582) || chr(1608) || chr(1575) || chr(1607) || chr(1605), 'set_display_name: ZWNJ を使う言語の名前（ペルシア語） は使える');
select is(set_display_name('ab' || chr(8204) || 'cd'), 'ab' || chr(8204) || 'cd', 'set_display_name: ラテン文字の間の ZWNJ は使える');
select is(set_display_name(chr(127988)), chr(127988), 'set_display_name: 黒旗だけ（タグ列なし） は使える');
select is(set_display_name(chr(127997)), chr(127997), 'set_display_name: 肌の色の修飾子だけ は使える');
select throws_ok($$ select set_display_name(chr(8205)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: ZWJ だけ は不可');
select throws_ok($$ select set_display_name(chr(8204)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: ZWNJ だけ は不可');
select throws_ok($$ select set_display_name(chr(8205) || chr(8204) || chr(8205)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: ZWJ と ZWNJ だけ は不可');
select throws_ok($$ select set_display_name(chr(917607) || chr(917602)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: タグ文字だけ は不可');
select throws_ok($$ select set_display_name(chr(917631)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: タグの終端だけ は不可');
select throws_ok($$ select set_display_name('灯り' || chr(8205) || 'の人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 文字の間の ZWJ は不可');
select throws_ok($$ select set_display_name(chr(127982) || chr(8205) || 'の人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 絵文字の後・文字の前の ZWJ は不可');
select throws_ok($$ select set_display_name('灯り' || chr(8205) || chr(127982)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 文字の後・絵文字の前の ZWJ は不可');
select throws_ok($$ select set_display_name(chr(127982) || chr(8205)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 末尾の ZWJ は不可');
select throws_ok($$ select set_display_name(chr(8205) || chr(127982)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 先頭の ZWJ は不可');
select throws_ok($$ select set_display_name(chr(128104) || chr(8205) || chr(8205) || chr(128105)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: ZWJ の連続 は不可');
select throws_ok($$ select set_display_name('1' || chr(8204) || '2') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 数字の間の ZWNJ は不可');
select throws_ok($$ select set_display_name(chr(127982) || chr(8204) || chr(127982)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 絵文字の間の ZWNJ は不可');
select throws_ok($$ select set_display_name(chr(8204) || chr(1605) || chr(1740)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 先頭の ZWNJ は不可');
select throws_ok($$ select set_display_name(chr(1605) || chr(1740) || chr(8204)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 末尾の ZWNJ は不可');
select throws_ok($$ select set_display_name(chr(127988) || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || '灯り') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 終端の無いタグ列 は不可');
select throws_ok($$ select set_display_name('灯り' || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || chr(917631)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 黒旗の無いタグ列 は不可');
select throws_ok($$ select set_display_name(chr(127982) || chr(917607) || chr(917602) || chr(917631)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 黒旗以外の絵文字に付けたタグ列 は不可');
select throws_ok($$ select set_display_name('灯り' || chr(917608) || chr(917609) || 'の人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 文字の中に隠したタグ列 は不可');
select throws_ok($$ select set_display_name(chr(127988) || chr(917631)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: タグの中身が無い終端 は不可');
select throws_ok($$ select set_display_name('ㅤ') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: ハングルの埋め字だけ は不可');
select throws_ok($$ select set_display_name(chr(10240)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 点字の空白だけ は不可');
select throws_ok($$ select set_display_name(chr(65039)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 異体字セレクタだけ は不可');
select throws_ok($$ select set_display_name(chr(769)) $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 結合文字だけ は不可');

select throws_ok(
  $$ select set_display_name(chr(1)) $$,
  '22023', '表示名に改行や制御文字は使えません',
  'set_display_name: 制御文字だけは、見えない文字より先に「改行や制御文字」（アプリと同じ順）'
);
select throws_ok(
  $$ select set_display_name(chr(8205) || 'a@b') $$,
  '22023', '表示名に見えない文字は使えません',
  'set_display_name: 並びの検査はメールアドレスの形より先（アプリと同じ順）'
);
select is(
  (select display_name from users where id = 'a4150000-0000-4000-8000-000000000001'),
  chr(127997),
  '拒否された名前は保存されず、最後に受け付けた名前（肌の色の修飾子）のまま'
);

reset role;

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
      ('public.display_name_is_letter(integer)', false),
      ('public.display_name_is_invisible(integer)', false),
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
