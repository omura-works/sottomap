-- 0014_account_deletion_and_note.sql（docs/SPEC.md §9.18・§9.17、最終レビュー R21 重要1・軽微2・軽微4、退会の決定事項）を検証する pgTAP テスト。
--
--   1. 確認の回答の備考（note）は保存しない（answer_verification は受け取っても NULL。表の制約でも NULL だけ）。
--   2. 退会: 運営用 RPC delete_account(uuid) でアカウントを消すと、投稿・承認・回答・栞・台帳・問い合わせ
--      （requester_id が一致するもの）まで何も残らない。ログインせずに送った問い合わせは残る。
--   3. 照合: 運営用 RPC find_account_by_email(text) は、前後の空白・大文字小文字を揃えて auth.users のメールと照合する。
--   4. 表示名: ZWJ・ZWNJ・タグ文字（U+E0020–U+E007F）は使える。ほかの見えない文字は「表示名に見えない文字は使えません」。
--   5. spot_verifier_counts と spots / verifications の RLS のずれの検出（各状態 × 各閲覧者）。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 見えない文字は chr() で作る（ファイルに直接書かない）。最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(55);

-- =========================================================
-- テストデータ（postgres として作成）
--   街 T1・T2
--   A: T1 の投稿者（ずれの検出の投稿者）
--   B, E: T1 の住人（ずれの検出の回答者。閲覧者には使わない。自分の回答は RLS で見えるため）
--   C: T1 の住人（閲覧者） / D: T2 の住人（閲覧者） / N: 住んでいる街が未設定（閲覧者）
--   X: 退会する利用者（投稿・承認・回答・栞・台帳・問い合わせを持つ）
--   Y: X の請求と同じ返信先で、ログインせずに送った人の代わり（行だけ。auth.users には無い）
--   Z1, Z2: メールの大文字小文字だけが違う2件（照合があいまいな場合）
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('f4140000-0000-4000-8000-000000000001', 'r21-test-city-1', 'R21街1', 'あーるにじゅういちまち1', false, 43.06, 141.35),
  ('f4140000-0000-4000-8000-000000000002', 'r21-test-city-2', 'R21街2', 'あーるにじゅういちまち2', false, 43.19, 140.99);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('a4140000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-a@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-b@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-c@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-d@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-e@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-n@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-000000000024', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'R21-Leaving@Example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-000000000031', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r21-dup@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('a4140000-0000-4000-8000-000000000032', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'R21-DUP@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, lantern_points) values
  ('a4140000-0000-4000-8000-00000000000a', 'R21A', 'f4140000-0000-4000-8000-000000000001', 0),
  ('a4140000-0000-4000-8000-00000000000b', 'R21B', 'f4140000-0000-4000-8000-000000000001', 0),
  ('a4140000-0000-4000-8000-00000000000c', 'R21C', 'f4140000-0000-4000-8000-000000000001', 0),
  ('a4140000-0000-4000-8000-00000000000d', 'R21D', 'f4140000-0000-4000-8000-000000000002', 0),
  ('a4140000-0000-4000-8000-00000000000e', 'R21E', 'f4140000-0000-4000-8000-000000000001', 0),
  ('a4140000-0000-4000-8000-000000000011', 'R21N', null, 0),
  ('a4140000-0000-4000-8000-000000000024', 'R21X', 'f4140000-0000-4000-8000-000000000001', 5);

-- ずれの検出用: A の4状態の店（T1）。
-- 退会用: X の公開中の店 SX と、X が承認・回答・栞をした A の公開中の店 SP（= ずれの検出の published と同じ店）。
insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('b4140000-0000-4000-8000-000000000001', 'f4140000-0000-4000-8000-000000000001', 'R21-pending',   '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', 'a4140000-0000-4000-8000-00000000000a', 'pending',   now() - interval '1 day', null),
  ('b4140000-0000-4000-8000-000000000002', 'f4140000-0000-4000-8000-000000000001', 'R21-published', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', 'a4140000-0000-4000-8000-00000000000a', 'published', now() - interval '200 days', now() - interval '190 days'),
  ('b4140000-0000-4000-8000-000000000003', 'f4140000-0000-4000-8000-000000000001', 'R21-dormant',   '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', 'a4140000-0000-4000-8000-00000000000a', 'dormant',   now() - interval '600 days', now() - interval '590 days'),
  ('b4140000-0000-4000-8000-000000000004', 'f4140000-0000-4000-8000-000000000001', 'R21-expired',   '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', 'a4140000-0000-4000-8000-00000000000a', 'expired',   now() - interval '600 days', now() - interval '590 days'),
  ('b4140000-0000-4000-8000-000000000024', 'f4140000-0000-4000-8000-000000000001', 'R21-X の店',   '理由', 'weekly', 'SRID=4326;POINT(141.36 43.07)', 'a4140000-0000-4000-8000-000000000024', 'published', now() - interval '100 days', now() - interval '95 days');

-- 回答済みの依頼と回答: 4状態の店それぞれに B と E が1件ずつ（直近24時間以内）→ 見える店の人数は2。
insert into verification_requests (id, spot_id, user_id, due_at, status) values
  ('c4140000-0000-4000-8000-0000000000b1', 'b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-00000000000b', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000b2', 'b4140000-0000-4000-8000-000000000002', 'a4140000-0000-4000-8000-00000000000b', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000b3', 'b4140000-0000-4000-8000-000000000003', 'a4140000-0000-4000-8000-00000000000b', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000b4', 'b4140000-0000-4000-8000-000000000004', 'a4140000-0000-4000-8000-00000000000b', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000e1', 'b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-00000000000e', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000e2', 'b4140000-0000-4000-8000-000000000002', 'a4140000-0000-4000-8000-00000000000e', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000e3', 'b4140000-0000-4000-8000-000000000003', 'a4140000-0000-4000-8000-00000000000e', now() - interval '3 hours', 'answered'),
  ('c4140000-0000-4000-8000-0000000000e4', 'b4140000-0000-4000-8000-000000000004', 'a4140000-0000-4000-8000-00000000000e', now() - interval '3 hours', 'answered'),
  -- X: A の公開中の店への回答（ずれの検出が終わってから作る回答の依頼。ここでは open・期限到来済み）
  ('c4140000-0000-4000-8000-000000000024', 'b4140000-0000-4000-8000-000000000002', 'a4140000-0000-4000-8000-000000000024', now() - interval '1 day', 'open'),
  -- 表の制約の確認用（C 宛て。使われていない依頼）
  ('c4140000-0000-4000-8000-0000000000c9', 'b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-00000000000c', now() - interval '1 day', 'open'),
  -- X の店の依頼（投稿者 X 宛て）
  ('c4140000-0000-4000-8000-000000000025', 'b4140000-0000-4000-8000-000000000024', 'a4140000-0000-4000-8000-000000000024', now() + interval '80 days', 'open');

insert into verifications (id, spot_id, user_id, answer, created_at, verification_request_id) values
  ('d4140000-0000-4000-8000-0000000000b1', 'b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-00000000000b', 'quiet',    now() - interval '2 hours', 'c4140000-0000-4000-8000-0000000000b1'),
  ('d4140000-0000-4000-8000-0000000000b2', 'b4140000-0000-4000-8000-000000000002', 'a4140000-0000-4000-8000-00000000000b', 'quiet',    now() - interval '2 hours', 'c4140000-0000-4000-8000-0000000000b2'),
  ('d4140000-0000-4000-8000-0000000000b3', 'b4140000-0000-4000-8000-000000000003', 'a4140000-0000-4000-8000-00000000000b', 'quiet',    now() - interval '2 hours', 'c4140000-0000-4000-8000-0000000000b3'),
  ('d4140000-0000-4000-8000-0000000000b4', 'b4140000-0000-4000-8000-000000000004', 'a4140000-0000-4000-8000-00000000000b', 'quiet',    now() - interval '2 hours', 'c4140000-0000-4000-8000-0000000000b4'),
  ('d4140000-0000-4000-8000-0000000000e1', 'b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-00000000000e', 'crowding', now() - interval '1 hour',  'c4140000-0000-4000-8000-0000000000e1'),
  ('d4140000-0000-4000-8000-0000000000e2', 'b4140000-0000-4000-8000-000000000002', 'a4140000-0000-4000-8000-00000000000e', 'crowding', now() - interval '1 hour',  'c4140000-0000-4000-8000-0000000000e2'),
  ('d4140000-0000-4000-8000-0000000000e3', 'b4140000-0000-4000-8000-000000000003', 'a4140000-0000-4000-8000-00000000000e', 'crowding', now() - interval '1 hour',  'c4140000-0000-4000-8000-0000000000e3'),
  ('d4140000-0000-4000-8000-0000000000e4', 'b4140000-0000-4000-8000-000000000004', 'a4140000-0000-4000-8000-00000000000e', 'crowding', now() - interval '1 hour',  'c4140000-0000-4000-8000-0000000000e4');

-- =========================================================
-- 1. 確認の回答の備考（R21 重要1）
-- =========================================================
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
   where p.oid = 'public.answer_verification(uuid,text,text)'::regprocedure),
  'answer_verification は security definer・search_path 空のまま（引数の形も 0006 と同じ）'
);
select is(
  (select count(*)::int from verifications where note is not null),
  0,
  '既存の備考はすべて NULL（seed を含む）'
);
select throws_ok(
  $$ insert into verifications (spot_id, user_id, answer, note, verification_request_id)
     values ('b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-00000000000c', 'quiet', 'メモ', 'c4140000-0000-4000-8000-0000000000c9') $$,
  '23514', null,
  '表の制約: 備考の入った確認の行は、運営（postgres・service_role）からも入れられない'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-000000000024","role":"authenticated"}';

select is(
  (answer_verification('c4140000-0000-4000-8000-000000000024', 'quiet', repeat('あ', 600)) ->> 'accepted'),
  'true',
  'answer_verification: 備考を渡されても（長さに関係なく）回答は受け付ける'
);

reset role;

select is(
  (select row(v.note, v.answer)::text from verifications v where v.verification_request_id = 'c4140000-0000-4000-8000-000000000024'),
  row(null::text, 'quiet')::text,
  'answer_verification: 備考は保存しない（NULL）。答えだけを保存する'
);

-- =========================================================
-- 2. 照合用 RPC find_account_by_email（service_role のみ）
-- =========================================================
select has_function('public', 'find_account_by_email', array['text'], '関数 find_account_by_email(text) がある');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] and p.prorettype = 'uuid'::regtype
   from pg_catalog.pg_proc p where p.oid = 'public.find_account_by_email(text)'::regprocedure),
  'find_account_by_email は security definer・search_path 空・uuid を返す'
);
select ok(
  not has_function_privilege('public', 'public.find_account_by_email(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.find_account_by_email(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.find_account_by_email(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.find_account_by_email(text)', 'EXECUTE'),
  '権限表: find_account_by_email は service_role だけが実行できる'
);

set local role service_role;

select is(
  public.find_account_by_email('r21-leaving@example.invalid'),
  'a4140000-0000-4000-8000-000000000024'::uuid,
  '照合: 登録のメール（大文字を含む）と、小文字で書いた返信先が一致する'
);
select is(
  public.find_account_by_email(' 　R21-LEAVING@EXAMPLE.INVALID' || chr(10)),
  'a4140000-0000-4000-8000-000000000024'::uuid,
  '照合: 前後の空白（全角空白・改行を含む）を除き、大文字小文字を揃えて比べる'
);
select is(
  public.find_account_by_email('r21-leaving@example.invalid.other'),
  null::uuid,
  '照合: 一致しなければ NULL（登録が見つからない）'
);
select is(public.find_account_by_email(null), null::uuid, '照合: NULL なら NULL');
select is(public.find_account_by_email(' 　'), null::uuid, '照合: 空白だけなら NULL');
select throws_ok(
  $$ select public.find_account_by_email('r21-dup@example.invalid') $$,
  '21000', 'このメールアドレスに当たる登録が複数あります',
  '照合: 大文字小文字だけが違う登録が複数あれば、どれか一つを選ばずに止める'
);

reset role;

-- =========================================================
-- 3. 退会 RPC delete_account（service_role のみ）と、問い合わせの外部キー
-- =========================================================
select has_function('public', 'delete_account', array['uuid'], '関数 delete_account(uuid) がある');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_catalog.pg_proc p where p.oid = 'public.delete_account(uuid)'::regprocedure),
  'delete_account は security definer・search_path 空'
);
select ok(
  not has_function_privilege('public', 'public.delete_account(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.delete_account(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.delete_account(uuid)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.delete_account(uuid)', 'EXECUTE'),
  '権限表: delete_account は service_role だけが実行できる'
);
select is(
  (select c.confdeltype::text from pg_catalog.pg_constraint c
   where c.conrelid = 'public.contact_messages'::regclass
     and c.contype = 'f'
     and c.confrelid = 'auth.users'::regclass),
  'c',
  'contact_messages.requester_id の外部キーは on delete cascade（退会で問い合わせの記録も消える）'
);

-- X の持ち物を足す: A の店への承認・栞、台帳、問い合わせ（ログイン中の privacy と other）。
insert into endorsements (spot_id, user_id) values
  ('b4140000-0000-4000-8000-000000000001', 'a4140000-0000-4000-8000-000000000024');
insert into bookmarks (user_id, spot_id) values
  ('a4140000-0000-4000-8000-000000000024', 'b4140000-0000-4000-8000-000000000002');
insert into contact_messages (category, message, reply_to, requester_id) values
  ('privacy', 'R21: ログイン中の請求', null, 'a4140000-0000-4000-8000-000000000024'),
  ('other',   'R21: ログイン中のご意見', null, 'a4140000-0000-4000-8000-000000000024'),
  ('privacy', 'R21: ログインせずに送った請求', 'r21-leaving@example.invalid', null),
  ('removal', 'R21: X の店について別の人から', null, null);
update contact_messages set spot_id = 'b4140000-0000-4000-8000-000000000024'
where message = 'R21: X の店について別の人から';

select ok(
  (select count(*) from lantern_events where user_id = 'a4140000-0000-4000-8000-000000000024') > 0
  and (select count(*) from verifications where user_id = 'a4140000-0000-4000-8000-000000000024') = 1,
  '退会の前: X には確認の回答と台帳の記録がある'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-000000000024","role":"authenticated"}';
select throws_ok(
  $$ select public.delete_account('a4140000-0000-4000-8000-000000000024') $$,
  '42501', null,
  '本人（authenticated）は delete_account を実行できない（退会は運営が本人確認のうえで行う）'
);
reset role;

set local role service_role;

select throws_ok(
  $$ select public.delete_account(null) $$,
  '22023', 'アカウントを指定してください',
  'delete_account: NULL は拒否する'
);
select throws_ok(
  $$ select public.delete_account('a4140000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'アカウントが見つかりませんでした',
  'delete_account: 存在しないアカウントは「見つからない」'
);
select lives_ok(
  $$ select public.delete_account('a4140000-0000-4000-8000-000000000024') $$,
  'delete_account: 運営（service_role）は退会の処理ができる'
);

reset role;

select is(
  (select count(*)::int from auth.users where id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: auth.users の行は無い'
);
select is(
  (select count(*)::int from users where id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: プロフィールは無い'
);
select is(
  (select count(*)::int from spots where author_id = 'a4140000-0000-4000-8000-000000000024'
      or id = 'b4140000-0000-4000-8000-000000000024'),
  0, '退会の後: 投稿した店は無い'
);
select is(
  (select count(*)::int from endorsements where user_id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: 承認は無い'
);
select is(
  (select count(*)::int from verifications where user_id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: 確認の回答は無い'
);
select is(
  (select count(*)::int from verification_requests where user_id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: 確認の依頼は無い'
);
select is(
  (select count(*)::int from bookmarks where user_id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: 栞は無い'
);
select is(
  (select count(*)::int from lantern_events where user_id = 'a4140000-0000-4000-8000-000000000024'),
  0, '退会の後: 灯りの台帳は無い'
);
select is(
  (select count(*)::int from contact_messages
   where requester_id = 'a4140000-0000-4000-8000-000000000024'
      or message in ('R21: ログイン中の請求', 'R21: ログイン中のご意見')),
  0, '退会の後: ログイン中に送った問い合わせ（請求を含む）も残らない'
);
select is(
  (select row(requester_id, reply_to, category)::text from contact_messages where message = 'R21: ログインせずに送った請求'),
  row(null::uuid, 'r21-leaving@example.invalid', 'privacy')::text,
  '退会の後: ログインせずに返信先付きで送った問い合わせは残る（アカウントに結び付いていないため）'
);
select is(
  (select row(spot_id, category)::text from contact_messages where message = 'R21: X の店について別の人から'),
  row(null::uuid, 'removal')::text,
  '退会の後: 別の人が X の店について送った問い合わせは残り、店との結び付きだけが外れる'
);
select is(
  (select count(*)::int from spots where id = 'b4140000-0000-4000-8000-000000000002'),
  1, '退会の後: X が承認・回答・栞をした他人の店はそのまま'
);
select is(
  (select row(v.user_id, vr.status)::text
   from verification_requests vr
   left join verifications v on v.verification_request_id = vr.id
   where vr.id = 'c4140000-0000-4000-8000-0000000000b2'),
  row('a4140000-0000-4000-8000-00000000000b'::uuid, 'answered')::text,
  '退会の後: 他人の回答と依頼はそのまま'
);
select is(
  (select count(*)::int from spot_verifier_counts(array['b4140000-0000-4000-8000-000000000002']::uuid[])),
  1,
  '退会の後: 他人の店の人数は数えられる（X の回答は数えない）'
);

-- =========================================================
-- 4. 表示名の見えない文字（R21 軽微2）
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-00000000000c","role":"authenticated"}';

select is(
  set_display_name('灯り' || chr(128104) || chr(8205) || chr(128105) || chr(8205) || chr(128103)),
  '灯り' || chr(128104) || chr(8205) || chr(128105) || chr(8205) || chr(128103),
  'set_display_name: ZWJ（U+200D）でつないだ家族の絵文字は使える'
);
select is(
  set_display_name(chr(127988) || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || chr(917631) || '灯り'),
  chr(127988) || chr(917607) || chr(917602) || chr(917605) || chr(917614) || chr(917607) || chr(917631) || '灯り',
  'set_display_name: タグ文字（U+E0020–U+E007F）で作る地域旗は使える'
);
select is(
  set_display_name(chr(1605) || chr(1740) || chr(8204) || chr(1582) || chr(1608) || chr(1575) || chr(1607) || chr(1605)),
  chr(1605) || chr(1740) || chr(8204) || chr(1582) || chr(1608) || chr(1575) || chr(1607) || chr(1605),
  'set_display_name: ZWNJ（U+200C）を使う言語の名前は使える'
);
select throws_ok(
  $$ select set_display_name('灯り' || chr(8238) || 'の人') $$,
  '22023', '表示名に見えない文字は使えません',
  'set_display_name: U+202E（右から左への上書き）は「見えない文字」として不可'
);
select throws_ok(
  $$ select set_display_name('灯り' || chr(8203) || 'の人') $$,
  '22023', '表示名に見えない文字は使えません',
  'set_display_name: U+200B（ゼロ幅空白）は不可'
);
select throws_ok(
  $$ select set_display_name('灯り' || chr(8288) || 'の人') $$,
  '22023', '表示名に見えない文字は使えません',
  'set_display_name: U+2060（単語結合子）は不可'
);
select throws_ok(
  $$ select set_display_name(chr(65279)) $$,
  '22023', '表示名に見えない文字は使えません',
  'set_display_name: U+FEFF だけの名前も「見えない文字」（アプリと同じ）'
);
select throws_ok(
  $$ select set_display_name('灯りの人' || chr(917505)) $$,
  '22023', '表示名に見えない文字は使えません',
  'set_display_name: U+E0001（言語タグ。許すタグ文字の範囲の外）は不可'
);
select throws_ok(
  $$ select set_display_name('灯り' || chr(10) || 'の人') $$,
  '22023', '表示名に改行や制御文字は使えません',
  'set_display_name: 改行はこれまでどおり「改行や制御文字」'
);

reset role;

select ok(
  not has_function_privilege('public', 'public.contains_format_character(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.contains_format_character(text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.contains_format_character(text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.contains_format_character(text)', 'EXECUTE'),
  'contains_format_character は作り直しても誰にも EXECUTE を与えない'
);

-- =========================================================
-- 5. spot_verifier_counts と RLS のずれの検出（R21 軽微4）
--    各閲覧者について、4状態の店の「RLS で見える確認の件数（店ごと）」と、関数の返す人数が一致する。
--    回答者 B・E は閲覧者に使わない（自分の回答は店が見えなくても RLS で見えるため）。
--    加えて「spots の RLS で見える店」と「関数が行を返す店」も一致する。
-- =========================================================

-- 匿名
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select spot_id, count(*)::int from verifications where spot_id = any (array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[])
     group by spot_id order by spot_id $$,
  'ずれの検出（匿名）: 関数の人数 = RLS で見える確認の件数'
);
select results_eq(
  $$ select spot_id from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select id from spots where id::text like 'b4140000-%' and id <> 'b4140000-0000-4000-8000-000000000024' order by id $$,
  'ずれの検出（匿名）: 関数が数える店 = spots の RLS で見える店（公開中だけ）'
);
reset role;

-- 投稿者 A（どの状態の店も見える）
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-00000000000a","role":"authenticated"}';
select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select spot_id, count(*)::int from verifications where spot_id = any (array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[])
     group by spot_id order by spot_id $$,
  'ずれの検出（投稿者）: 関数の人数 = RLS で見える確認の件数'
);
select is(
  (select count(*)::int from spot_verifier_counts(array[
     'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
     'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[])),
  4,
  'ずれの検出（投稿者）: 4状態すべての店が数えられる（検出が空振りしていない）'
);
reset role;

-- 同じ街の住人 C
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-00000000000c","role":"authenticated"}';
select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select spot_id, count(*)::int from verifications where spot_id = any (array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[])
     group by spot_id order by spot_id $$,
  'ずれの検出（同じ街の住人）: 関数の人数 = RLS で見える確認の件数（承認待ちと公開中）'
);
reset role;

-- 別の街の住人 D
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-00000000000d","role":"authenticated"}';
select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select spot_id, count(*)::int from verifications where spot_id = any (array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[])
     group by spot_id order by spot_id $$,
  'ずれの検出（別の街の住人）: 関数の人数 = RLS で見える確認の件数（公開中だけ）'
);
reset role;

-- 住んでいる街が未設定の N
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4140000-0000-4000-8000-000000000011","role":"authenticated"}';
select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select spot_id, count(*)::int from verifications where spot_id = any (array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[])
     group by spot_id order by spot_id $$,
  'ずれの検出（街が未設定）: 関数の人数 = RLS で見える確認の件数（公開中だけ）'
);
select results_eq(
  $$ select spot_id from spot_verifier_counts(array[
       'b4140000-0000-4000-8000-000000000001', 'b4140000-0000-4000-8000-000000000002',
       'b4140000-0000-4000-8000-000000000003', 'b4140000-0000-4000-8000-000000000004']::uuid[]) order by spot_id $$,
  $$ select id from spots where id::text like 'b4140000-%' order by id $$,
  'ずれの検出（街が未設定）: 関数が数える店 = spots の RLS で見える店'
);
reset role;

select * from finish();

rollback;
