-- 0012_public_data_minimization.sql（docs/SPEC.md §9.18、最終レビュー R20 重要1・重要2・軽微）を検証する pgTAP テスト。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 役割の切り替えは 0006_security.sql と同じく `set local role` と `request.jwt.claims` で行い、
-- 最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(54);

-- =========================================================
-- テストデータ（postgres として作成）
--   街 T1・T2
--   利用者 A: T1 の投稿者（エリア・居住年数あり → 0012 の整理で NULL になる）
--          B, C: T1 の住人（確認に回答した人）
--          D: T2 の住人
--          F: T2 の投稿者
--          G: 表示名に書式文字（U+202E）を含む既存の利用者
--   スポット
--     SP1: A の published。B（2時間前・100日前）と C（1時間前）の回答 → 直近24時間の人数は2
--     SP2: A の pending（T1）。B の回答1件（同じ街の住人と投稿者だけが人数を読める）
--     SP3: A の dormant。A の回答1件（投稿者本人だけが人数を読める）
--     SP4: F の pending（T2）。F の回答1件（T2 の住人と投稿者だけ）
--     SP5: A の published。A 宛ての open 依頼（期限到来済み）→ answer_verification の備考の長さ
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('eeee0000-0000-4000-8000-000000000001', 'minimize-test-city-1', '絞り込み街1', 'しぼりこみまち1', false, 43.06, 141.35),
  ('eeee0000-0000-4000-8000-000000000002', 'minimize-test-city-2', '絞り込み街2', 'しぼりこみまち2', false, 43.19, 140.99);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('99990000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min-a@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('99990000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min-b@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('99990000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min-c@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('99990000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min-d@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('99990000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min-f@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('99990000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'min-g@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
  ('99990000-0000-4000-8000-00000000000a', '絞りA', 'eeee0000-0000-4000-8000-000000000001', '北24条', 14, 0),
  ('99990000-0000-4000-8000-00000000000b', '絞りB', 'eeee0000-0000-4000-8000-000000000001', null, 5, 0),
  ('99990000-0000-4000-8000-00000000000c', '絞りC', 'eeee0000-0000-4000-8000-000000000001', '南', null, 0),
  ('99990000-0000-4000-8000-00000000000d', '絞りD', 'eeee0000-0000-4000-8000-000000000002', null, null, 0),
  ('99990000-0000-4000-8000-00000000000f', '絞りF', 'eeee0000-0000-4000-8000-000000000002', null, null, 0),
  ('99990000-0000-4000-8000-000000000010', E'偽\u202Eの人', 'eeee0000-0000-4000-8000-000000000001', null, null, 0);

insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('aaab0000-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000001', 'SP1', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '99990000-0000-4000-8000-00000000000a', 'published', now() - interval '200 days', now() - interval '190 days'),
  ('aaab0000-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-000000000001', 'SP2', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '99990000-0000-4000-8000-00000000000a', 'pending',   now() - interval '1 day', null),
  ('aaab0000-0000-4000-8000-000000000003', 'eeee0000-0000-4000-8000-000000000001', 'SP3', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '99990000-0000-4000-8000-00000000000a', 'dormant',   now() - interval '600 days', now() - interval '590 days'),
  ('aaab0000-0000-4000-8000-000000000004', 'eeee0000-0000-4000-8000-000000000002', 'SP4', '理由', 'weekly', 'SRID=4326;POINT(140.99 43.19)', '99990000-0000-4000-8000-00000000000f', 'pending',   now() - interval '1 day', null),
  ('aaab0000-0000-4000-8000-000000000005', 'eeee0000-0000-4000-8000-000000000001', 'SP5', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '99990000-0000-4000-8000-00000000000a', 'published', now() - interval '100 days', now() - interval '95 days');

-- 確認は必ず依頼に紐づく（0006）。回答済みの依頼を作ってから確認の行を入れる。
insert into verification_requests (id, spot_id, user_id, due_at, status) values
  ('bbbc0000-0000-4000-8000-000000000011', 'aaab0000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-00000000000b', now() - interval '101 days', 'answered'),
  ('bbbc0000-0000-4000-8000-000000000012', 'aaab0000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-00000000000b', now() - interval '3 hours', 'answered'),
  ('bbbc0000-0000-4000-8000-000000000013', 'aaab0000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-00000000000c', now() - interval '3 hours', 'answered'),
  ('bbbc0000-0000-4000-8000-000000000021', 'aaab0000-0000-4000-8000-000000000002', '99990000-0000-4000-8000-00000000000b', now() - interval '3 hours', 'answered'),
  ('bbbc0000-0000-4000-8000-000000000031', 'aaab0000-0000-4000-8000-000000000003', '99990000-0000-4000-8000-00000000000a', now() - interval '500 days', 'answered'),
  ('bbbc0000-0000-4000-8000-000000000041', 'aaab0000-0000-4000-8000-000000000004', '99990000-0000-4000-8000-00000000000f', now() - interval '3 hours', 'answered'),
  ('bbbc0000-0000-4000-8000-000000000051', 'aaab0000-0000-4000-8000-000000000005', '99990000-0000-4000-8000-00000000000a', now() - interval '1 day', 'open');

insert into verifications (id, spot_id, user_id, answer, note, created_at, verification_request_id) values
  ('cccd0000-0000-4000-8000-000000000011', 'aaab0000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-00000000000b', 'quiet', null, now() - interval '100 days', 'bbbc0000-0000-4000-8000-000000000011'),
  ('cccd0000-0000-4000-8000-000000000012', 'aaab0000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-00000000000b', 'quiet', null, now() - interval '2 hours', 'bbbc0000-0000-4000-8000-000000000012'),
  ('cccd0000-0000-4000-8000-000000000013', 'aaab0000-0000-4000-8000-000000000001', '99990000-0000-4000-8000-00000000000c', 'crowding', null, now() - interval '1 hour', 'bbbc0000-0000-4000-8000-000000000013'),
  ('cccd0000-0000-4000-8000-000000000021', 'aaab0000-0000-4000-8000-000000000002', '99990000-0000-4000-8000-00000000000b', 'quiet', null, now() - interval '2 hours', 'bbbc0000-0000-4000-8000-000000000021'),
  ('cccd0000-0000-4000-8000-000000000031', 'aaab0000-0000-4000-8000-000000000003', '99990000-0000-4000-8000-00000000000a', 'quiet', null, now() - interval '400 days', 'bbbc0000-0000-4000-8000-000000000031'),
  ('cccd0000-0000-4000-8000-000000000041', 'aaab0000-0000-4000-8000-000000000004', '99990000-0000-4000-8000-00000000000f', 'quiet', null, now() - interval '2 hours', 'bbbc0000-0000-4000-8000-000000000041');

-- =========================================================
-- 1. verifications の公開列（R20 重要1）
-- =========================================================
select ok(
  not has_table_privilege('anon', 'public.verifications', 'SELECT')
  and not has_table_privilege('authenticated', 'public.verifications', 'SELECT'),
  'anon / authenticated は verifications の表単位の SELECT を持たない（列単位だけ）'
);

select is_empty(
  $$
    with roles(role_name) as (values ('anon'), ('authenticated')),
    cols(col, allowed) as (values
      ('id', true), ('spot_id', true), ('answer', true), ('created_at', true),
      ('user_id', false), ('note', false), ('verification_request_id', false)
    )
    select r.role_name, c.col
    from roles r cross join cols c
    where has_column_privilege(r.role_name, 'public.verifications', c.col, 'SELECT') <> c.allowed
  $$,
  'verifications の列単位の SELECT: id, spot_id, answer, created_at だけ（user_id・note・verification_request_id は不可）'
);

select ok(
  has_table_privilege('service_role', 'public.verifications', 'SELECT'),
  'service_role（運営・cron）は verifications を表単位で読める'
);

-- =========================================================
-- 2. 集計 RPC と本人専用 RPC の定義・権限
-- =========================================================
select has_function('public', 'spot_verifier_counts', array['uuid[]'], '関数 spot_verifier_counts(uuid[]) がある');
select has_function('public', 'list_my_verification_times', array[]::text[], '関数 list_my_verification_times() がある');

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.spot_verifier_counts(uuid[])'::regprocedure),
  'spot_verifier_counts は security definer・search_path 空'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.list_my_verification_times()'::regprocedure),
  'list_my_verification_times は security definer・search_path 空'
);

select is_empty(
  $$
    with fns(fn, anon_ok, auth_ok, service_ok) as (values
      ('public.spot_verifier_counts(uuid[])', true, true, false),
      ('public.list_my_verification_times()', false, true, false),
      ('public.minimize_profile_data()', false, false, false)
    )
    select f.fn, e.role_name
    from fns f
    cross join lateral (values
      ('public', false), ('anon', f.anon_ok), ('authenticated', f.auth_ok), ('service_role', f.service_ok)
    ) as e(role_name, allowed)
    where has_function_privilege(e.role_name, f.fn, 'EXECUTE') <> e.allowed
  $$,
  '権限表: 集計 RPC は anon / authenticated、本人専用 RPC は authenticated だけ、整理用の関数は誰にも不可'
);

select is(
  (select pg_get_function_result('public.spot_verifier_counts(uuid[])'::regprocedure)),
  'TABLE(spot_id uuid, verifier_count integer)',
  'spot_verifier_counts が返すのは店のIDと人数だけ'
);
select is(
  (select pg_get_function_result('public.list_my_verification_times()'::regprocedure)),
  'SETOF timestamp with time zone',
  'list_my_verification_times が返すのは回答日時だけ'
);

-- =========================================================
-- 3. 公開プロフィール（R20 重要2）
-- =========================================================
select has_column('public', 'public_profiles', 'id', 'public_profiles に id はある');
select has_column('public', 'public_profiles', 'display_name', 'public_profiles に display_name はある');
select hasnt_column('public', 'public_profiles', 'area_name', 'public_profiles に area_name は無い');
select hasnt_column('public', 'public_profiles', 'resident_years', 'public_profiles に resident_years は無い');
select ok(
  (select c.reloptions @> array['security_barrier=true'] from pg_class c where c.oid = 'public.public_profiles'::regclass),
  'public_profiles は作り直しても security_barrier のビュー'
);
select ok(
  has_table_privilege('anon', 'public.public_profiles', 'SELECT')
  and has_table_privilege('authenticated', 'public.public_profiles', 'SELECT')
  and has_table_privilege('service_role', 'public.public_profiles', 'SELECT'),
  '作り直した public_profiles を anon / authenticated / service_role が読める'
);

-- 既存の値の整理（マイグレーションで1回呼ぶ関数。テストでは postgres として呼ぶ）
-- seed.sql はマイグレーションの後に入るので、seed の利用者の値は先に消しておき、件数をテストの利用者だけにする。
update users set area_name = null, resident_years = null where id::text not like '99990000-%';
select is(public.minimize_profile_data(), 4, '整理の対象はエリア・居住年数のある3人と、書式文字の表示名の1人（4件）');
select is(
  (select count(*)::int from users
   where id::text like '99990000-%' and (area_name is not null or resident_years is not null)),
  0,
  '既存の area_name・resident_years は NULL になる'
);
select is(
  (select display_name from users where id = '99990000-0000-4000-8000-000000000010'),
  '地元の人',
  '書式文字（U+202E）を含む既存の表示名は「地元の人」に置き換わる'
);
select is(
  (select display_name from users where id = '99990000-0000-4000-8000-00000000000a'),
  '絞りA',
  '書式文字の無い表示名はそのまま'
);
select is(public.minimize_profile_data(), 0, '整理は冪等（2回目は0件）');

-- =========================================================
-- 4. 匿名（anon）
-- =========================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is(
  (select count(*)::int from verifications where spot_id = 'aaab0000-0000-4000-8000-000000000001'),
  3,
  '匿名: 公開中の店の確認は、公開列で読める（3件）'
);
select is(
  (select array_agg(answer::text order by created_at) from verifications where spot_id = 'aaab0000-0000-4000-8000-000000000001'),
  array['quiet', 'quiet', 'crowding'],
  '匿名: 回答の中身（answer）と日時は読める'
);
select throws_ok($$ select user_id from verifications $$, '42501', null, '匿名: verifications.user_id は読めない');
select throws_ok($$ select note from verifications $$, '42501', null, '匿名: verifications.note は読めない');
select throws_ok($$ select * from verifications $$, '42501', null, '匿名: verifications の全列（*）は読めない');
select throws_ok(
  $$ select count(*) from verifications where user_id = '99990000-0000-4000-8000-00000000000b' $$,
  '42501', null,
  '匿名: user_id で絞り込んで、ある人の回答履歴を数えることもできない'
);
select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'aaab0000-0000-4000-8000-000000000001', 'aaab0000-0000-4000-8000-000000000002',
       'aaab0000-0000-4000-8000-000000000003', 'aaab0000-0000-4000-8000-000000000004'
     ]::uuid[]) order by spot_id $$,
  $$ values ('aaab0000-0000-4000-8000-000000000001'::uuid, 2) $$,
  '匿名: 人数は公開中の店だけ（直近24時間に回答した人の数。100日前の回答は数えない）'
);
select is(
  (select count(*)::int from spot_verifier_counts(array[]::uuid[])),
  0,
  '匿名: 空の配列なら0行'
);
select is(
  (select count(*)::int from spot_verifier_counts(null)),
  0,
  '匿名: NULL なら0行'
);
select throws_ok($$ select * from list_my_verification_times() $$, '42501', null, '匿名: 本人専用 RPC は実行できない');
select is(
  (select count(*)::int from public_profiles where id = '99990000-0000-4000-8000-00000000000a'),
  1,
  '匿名: 公開中の店の投稿者は public_profiles で読める（表示名だけ）'
);
select throws_ok($$ select area_name from public_profiles $$, '42703', null, '匿名: public_profiles に area_name 列は無い');

reset role;

-- =========================================================
-- 5. 同じ街の住人 B（ログイン済み）
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"99990000-0000-4000-8000-00000000000b","role":"authenticated"}';

select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'aaab0000-0000-4000-8000-000000000001', 'aaab0000-0000-4000-8000-000000000002',
       'aaab0000-0000-4000-8000-000000000003', 'aaab0000-0000-4000-8000-000000000004'
     ]::uuid[]) order by spot_id $$,
  $$ values ('aaab0000-0000-4000-8000-000000000001'::uuid, 2), ('aaab0000-0000-4000-8000-000000000002'::uuid, 1) $$,
  '同じ街 B: 公開中の店と、自分の街の承認待ちの店の人数だけ（他人の dormant・別の街の pending は出ない）'
);
select throws_ok($$ select user_id from verifications $$, '42501', null, '同じ街 B: verifications.user_id は読めない');
select throws_ok($$ select note from verifications $$, '42501', null, '同じ街 B: 自分の回答でも note は表から読めない');
select results_eq(
  $$ select t from list_my_verification_times() as t order by t $$,
  $$ select created_at from verifications
     where id in ('cccd0000-0000-4000-8000-000000000011', 'cccd0000-0000-4000-8000-000000000012', 'cccd0000-0000-4000-8000-000000000021')
     order by created_at $$,
  '同じ街 B: 本人専用 RPC は自分の回答の日時だけを返す（3件。C の回答は含まない）'
);

reset role;

-- =========================================================
-- 6. 別の街の住人 D
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"99990000-0000-4000-8000-00000000000d","role":"authenticated"}';

select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'aaab0000-0000-4000-8000-000000000001', 'aaab0000-0000-4000-8000-000000000002',
       'aaab0000-0000-4000-8000-000000000003', 'aaab0000-0000-4000-8000-000000000004'
     ]::uuid[]) order by spot_id $$,
  $$ values ('aaab0000-0000-4000-8000-000000000001'::uuid, 2), ('aaab0000-0000-4000-8000-000000000004'::uuid, 1) $$,
  '別の街 D: 公開中の店と、自分の街（T2）の承認待ちの店だけ'
);
select is(
  (select count(*)::int from list_my_verification_times()),
  0,
  '別の街 D: 回答していなければ本人専用 RPC は0件'
);

reset role;

-- =========================================================
-- 7. 投稿者 A（dormant の店は投稿者本人だけ）と answer_verification の備考の長さ
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"99990000-0000-4000-8000-00000000000a","role":"authenticated"}';

select results_eq(
  $$ select spot_id, verifier_count from spot_verifier_counts(array[
       'aaab0000-0000-4000-8000-000000000001', 'aaab0000-0000-4000-8000-000000000002',
       'aaab0000-0000-4000-8000-000000000003', 'aaab0000-0000-4000-8000-000000000004'
     ]::uuid[]) order by spot_id $$,
  $$ values ('aaab0000-0000-4000-8000-000000000001'::uuid, 2), ('aaab0000-0000-4000-8000-000000000002'::uuid, 1),
            ('aaab0000-0000-4000-8000-000000000003'::uuid, 1) $$,
  '投稿者 A: 自分の dormant の店の人数も読める（別の街の pending は出ない）'
);

-- 0014（R21 重要1）で備考は保存しなくなった（長さの検査もしない）。詳しくは tests/0014_account_deletion_and_note.sql。
select is(
  (answer_verification('bbbc0000-0000-4000-8000-000000000051', 'quiet', repeat('あ', 501)) ->> 'accepted'),
  'true',
  'answer_verification: 備考が501文字でも回答は受理する（0014 以降、備考は使わない）'
);
select is(
  (select status from verification_requests where id = 'bbbc0000-0000-4000-8000-000000000051'),
  'answered',
  'answer_verification: 受理した依頼は answered になる'
);
select is(
  (answer_verification('bbbc0000-0000-4000-8000-000000000051', 'quiet', 'もう一度') ->> 'accepted'),
  'false',
  'answer_verification: 同じ依頼への2回目は受理しない（0006 のまま）'
);

reset role;

select is(
  (select note from verifications where verification_request_id = 'bbbc0000-0000-4000-8000-000000000051'),
  null,
  '備考は保存しない（0014 以降は常に NULL）'
);

-- =========================================================
-- 8. 表示名の書式文字（R20 軽微。文言と許す文字は 0014〈R21 軽微2〉で改訂）
-- =========================================================
-- 0016（R23 重要1）から set_display_name は service_role だけ。
set local role service_role;

select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'灯り\u202Eの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+202E（右から左への上書き）は不可');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'\u2066灯りの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+2066（左から右への分離）は不可');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'灯り\u200Bの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+200B（ゼロ幅空白）は不可');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'灯り\u200Fの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+200F（右から左への記号）は不可（U+200D の ZWJ は 0014 から使える）');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'灯り\u061Cの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+061C は不可');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'灯り\u00ADの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+00AD（ソフトハイフン）は不可');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'\uFEFF灯りの人') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 先頭の U+FEFF は不可');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'\uFEFF') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: U+FEFF だけの名前も見えない文字として不可（アプリと同じ）');
select throws_ok($$ select set_display_name('99990000-0000-4000-8000-00000000000c', E'灯りの人\U000E0001') $$, '22023', '表示名に見えない文字は使えません', 'set_display_name: 言語タグ（U+E0001）は不可（U+E0020–U+E007F のタグ文字は 0014 から使える）');
select is(set_display_name('99990000-0000-4000-8000-00000000000c', E'灯り\u2764\uFE0F'), E'灯り\u2764\uFE0F', 'set_display_name: 異体字セレクタ（Cf ではない）は使える');

reset role;

select * from finish();

rollback;
