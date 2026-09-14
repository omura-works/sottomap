-- 0006_security_hardening.sql の権限表と DB 関数の規則（docs/SPEC.md §9.13）を検証する pgTAP テスト。
--
-- 【未実行】このリポジトリの開発環境には PostgreSQL / Docker / Supabase CLI が無いため、一度も実行していない。
-- 実行方法（Docker と Supabase CLI が必要）:
--   supabase start
--   supabase db reset      -- migrations 0001〜0006 と seed.sql を適用
--   supabase test db       -- supabase/tests/*.sql を pgTAP で実行
--
-- 役割の切り替えは Supabase の流儀に合わせ、`set local role` と `request.jwt.claims`（auth.uid() の元）で行う。
-- テスト用のデータは固定の UUID で作り、最後に rollback するので seed には影響しない。
--
-- 対象外（単一セッションの pgTAP では再現できないもの）:
--   同時回答・承認と cron の競合（SPEC §9.13.7）。関数はスポット行 → 依頼行の順に for update でロックし、
--   ロック後に状態を再検査する設計にしてある。検証には2つ以上の接続を使う別のテストが必要。

begin;

create extension if not exists pgtap with schema extensions;

select plan(42);

-- =========================================================
-- テストデータ（postgres として作成）
--   街: T1（投稿先）, T2（別の街）
--   利用者: A（T1・投稿者）, B / C（T1・同じ街）, D（T2・別の街）
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('aaaa0000-0000-4000-8000-000000000001', 'test-city-1', 'テスト街1', 'てすとまち1', false, 43.06, 141.35),
  ('aaaa0000-0000-4000-8000-000000000002', 'test-city-2', 'テスト街2', 'てすとまち2', true, 43.19, 140.99);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('11110000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-a@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('11110000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-b@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('11110000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-c@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('11110000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-d@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
  ('11110000-0000-4000-8000-00000000000a', 'テストA', 'aaaa0000-0000-4000-8000-000000000001', '北', 10, 0),
  ('11110000-0000-4000-8000-00000000000b', 'テストB', 'aaaa0000-0000-4000-8000-000000000001', '南', 5, 0),
  ('11110000-0000-4000-8000-00000000000c', 'テストC', 'aaaa0000-0000-4000-8000-000000000001', '東', 3, 0),
  ('11110000-0000-4000-8000-00000000000d', 'テストD', 'aaaa0000-0000-4000-8000-000000000002', '西', 7, 0);

-- スポット（すべて A の投稿・T1）
--   S1: pending（今作成）          → 承認の流れ
--   S2: pending（30日+1時間前に作成）→ 期限切れ承認の拒否・cron で expired
--   S3: published、open 依頼 R3 は期限前（now + 90日）
--   S4: published、open 依頼 R4 は期限到来済み（now - 1日）
--   S5: dormant、missed 依頼 R5old（古い）と R5new（最新）
--   S6: pending（31日前に作成）、期限内に2人の承認済み → cron が後でも公開
insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('22220000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001', 'S1', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'pending',   now(), null),
  ('22220000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000001', 'S2', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'pending',   now() - interval '30 days 1 hour', null),
  ('22220000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000001', 'S3', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'published', now() - interval '100 days', now() - interval '95 days'),
  ('22220000-0000-4000-8000-000000000004', 'aaaa0000-0000-4000-8000-000000000001', 'S4', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'published', now() - interval '100 days', now() - interval '95 days'),
  ('22220000-0000-4000-8000-000000000005', 'aaaa0000-0000-4000-8000-000000000001', 'S5', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'dormant',   now() - interval '600 days', now() - interval '590 days'),
  ('22220000-0000-4000-8000-000000000006', 'aaaa0000-0000-4000-8000-000000000001', 'S6', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'pending',   now() - interval '31 days', null);

insert into verification_requests (id, spot_id, user_id, due_at, status, created_at) values
  ('33330000-0000-4000-8000-000000000003', '22220000-0000-4000-8000-000000000003', '11110000-0000-4000-8000-00000000000a', now() + interval '90 days', 'open',   now() - interval '1 day'),
  ('33330000-0000-4000-8000-000000000004', '22220000-0000-4000-8000-000000000004', '11110000-0000-4000-8000-00000000000a', now() - interval '1 day',   'open',   now() - interval '91 days'),
  ('33330000-0000-4000-8000-000000000051', '22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', now() - interval '400 days', 'missed', now() - interval '490 days'),
  ('33330000-0000-4000-8000-000000000052', '22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', now() - interval '200 days', 'missed', now() - interval '290 days');

insert into endorsements (spot_id, user_id, created_at) values
  ('22220000-0000-4000-8000-000000000006', '11110000-0000-4000-8000-00000000000b', now() - interval '30 days'),
  ('22220000-0000-4000-8000-000000000006', '11110000-0000-4000-8000-00000000000c', now() - interval '29 days');

insert into verifications (spot_id, user_id, answer, created_at) values
  ('22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', 'quiet', now() - interval '500 days');

-- =========================================================
-- 匿名（anon）
-- =========================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*)::int from users), 0, '匿名: users の行は1件も読めない');
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000a'),
  1,
  '匿名: 表示用ビュー public_profiles は読める'
);
select throws_ok(
  $$ select lantern_points from public_profiles $$,
  '42703', null,
  '匿名: public_profiles に lantern_points 列は無い'
);
select is(
  (select count(*)::int from spots where id = '22220000-0000-4000-8000-000000000001'),
  0,
  '匿名: pending のスポットは読めない'
);
select is(
  (select count(*)::int from verifications where spot_id = '22220000-0000-4000-8000-000000000005'),
  0,
  '匿名: dormant スポットの確認履歴は読めない'
);
select is(
  (select count(*)::int from endorsements where spot_id = '22220000-0000-4000-8000-000000000006'),
  0,
  '匿名: pending スポットの承認は読めない'
);
select throws_ok(
  $$ select create_spot('aaaa0000-0000-4000-8000-000000000001', 'x', 'y', 43.0, 141.0, 'weekly') $$,
  '42501', null,
  '匿名: create_spot を実行できない'
);
select throws_ok(
  $$ insert into verifications (spot_id, user_id, answer) values ('22220000-0000-4000-8000-000000000004', '11110000-0000-4000-8000-00000000000a', 'quiet') $$,
  '42501', null,
  '匿名: verifications へ直接 insert できない'
);

-- =========================================================
-- 投稿者 A
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ update users set lantern_points = 9999 where id = '11110000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  '投稿者: lantern_points を直接更新できない'
);
select lives_ok(
  $$ update users set display_name = 'テストA2', resident_years = 11 where id = '11110000-0000-4000-8000-00000000000a' $$,
  '投稿者: 表示名・居住年数は更新できる'
);
select throws_ok(
  $$ update users set area_name = '偽' where id = '11110000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  '投稿者: 許可されていない列（area_name）は更新できない'
);
select throws_ok(
  $$ insert into users (id, display_name, lantern_points) values ('11110000-0000-4000-8000-00000000000a', 'x', 999) on conflict do nothing $$,
  '42501', null,
  '投稿者: insert でも lantern_points を指定できない'
);
select is(
  (select count(*)::int from users where id <> '11110000-0000-4000-8000-00000000000a'),
  0,
  '投稿者: 他人の users 行（全列）は読めない'
);
select throws_ok(
  $$ insert into verifications (spot_id, user_id, answer) values ('22220000-0000-4000-8000-000000000004', '11110000-0000-4000-8000-00000000000a', 'quiet') $$,
  '42501', null,
  '投稿者: 自分のスポットでも verifications へ直接 insert できない（確認履歴の捏造）'
);
select throws_ok(
  $$ insert into spots (city_id, name, reason, visit_frequency, location, author_id, status) values ('aaaa0000-0000-4000-8000-000000000001', 'x', 'y', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'published') $$,
  '42501', null,
  '投稿者: spots へ直接 insert できない'
);
select throws_ok(
  $$ update spots set status = 'published' where id = '22220000-0000-4000-8000-000000000001' $$,
  '42501', null,
  '投稿者: spots を直接 update できない'
);
select throws_ok(
  $$ update verification_requests set due_at = now() - interval '1 day' where id = '33330000-0000-4000-8000-000000000003' $$,
  '42501', null,
  '投稿者: verification_requests を直接 update できない'
);
select throws_ok(
  $$ select create_spot('aaaa0000-0000-4000-8000-000000000002', '別の街の店', '理由', 43.19, 140.99, 'weekly') $$,
  '42501', null,
  '投稿者: 住んでいない街には create_spot できない'
);
select isnt(
  create_spot('aaaa0000-0000-4000-8000-000000000001', '新しい店', '理由', 43.06, 141.35, 'monthly'),
  null,
  '投稿者: 住んでいる街には create_spot できる'
);
select throws_ok(
  $$ select endorse_spot('22220000-0000-4000-8000-000000000001') $$,
  '42501', null,
  '投稿者: 自分の投稿は承認できない'
);
select throws_ok(
  $$ select answer_verification('33330000-0000-4000-8000-000000000003', 'quiet', null) $$,
  '22023', null,
  '投稿者: 期限前（未来の due_at）の依頼には回答できない'
);
select is(
  (answer_verification('33330000-0000-4000-8000-000000000004', 'quiet', null) ->> 'pointsAwarded')::int,
  5,
  '投稿者: 期限到来済みの open 依頼に回答すると +5'
);
select is(
  (answer_verification('33330000-0000-4000-8000-000000000004', 'quiet', null) ->> 'accepted')::boolean,
  false,
  '投稿者: 同じ依頼への2回目は受理されない'
);
select throws_ok(
  $$ select answer_verification('33330000-0000-4000-8000-000000000051', 'quiet', null) $$,
  '22023', null,
  '投稿者: dormant でも最新ではない missed 依頼には回答できない'
);
select is(
  answer_verification('33330000-0000-4000-8000-000000000052', 'quiet', null) ->> 'status',
  'published',
  '投稿者: dormant の最新 missed 依頼に回答すると published に戻る'
);
select is(
  (answer_verification('33330000-0000-4000-8000-000000000052', 'quiet', null) ->> 'accepted')::boolean,
  false,
  '投稿者: 2回目の復帰回答は受理されない'
);
select throws_ok(
  $$ select run_verification_cron() $$,
  '42501', null,
  '投稿者（authenticated）: run_verification_cron を実行できない'
);
select is(
  (select count(*)::int from lantern_events where user_id <> '11110000-0000-4000-8000-00000000000a'),
  0,
  '投稿者: 他人の lantern_events は読めない'
);

-- =========================================================
-- 同じ街の住人 B / C、別の街の住人 D
-- =========================================================
set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-00000000000b","role":"authenticated"}';

select throws_ok(
  $$ insert into endorsements (spot_id, user_id) values ('22220000-0000-4000-8000-000000000001', '11110000-0000-4000-8000-00000000000b') $$,
  '42501', null,
  '同じ街: endorsements へ直接 insert できない（created_at の偽装）'
);
select is(
  endorse_spot('22220000-0000-4000-8000-000000000001') ->> 'status',
  'pending',
  '同じ街: 1人目の承認ではまだ pending'
);
select is(
  (endorse_spot('22220000-0000-4000-8000-000000000001') ->> 'endorsementCount')::int,
  1,
  '同じ街: 同じ人の重複承認は1人として数える（冪等）'
);
select throws_ok(
  $$ select endorse_spot('22220000-0000-4000-8000-000000000002') $$,
  '22023', null,
  '同じ街: 期限（created_at + 30日）を1時間過ぎた pending には承認できない'
);
select throws_ok(
  $$ select answer_verification('33330000-0000-4000-8000-000000000003', 'quiet', null) $$,
  'P0002', null,
  '同じ街: 他人宛ての確認依頼には回答できない（見つからない扱い）'
);

set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-00000000000d","role":"authenticated"}';
select throws_ok(
  $$ select endorse_spot('22220000-0000-4000-8000-000000000001') $$,
  '42501', null,
  '別の街: 承認できない'
);

set local request.jwt.claims to '{"sub":"11110000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is(
  endorse_spot('22220000-0000-4000-8000-000000000001') ->> 'status',
  'published',
  '同じ街: 2人目の承認で published'
);
select throws_ok(
  $$ select endorse_spot('22220000-0000-4000-8000-000000000001') $$,
  '22023', null,
  '同じ街: 公開済みのスポットには承認できない'
);

-- =========================================================
-- service_role（cron）
-- =========================================================
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';

select lives_ok($$ select run_verification_cron() $$, 'service_role: run_verification_cron を実行できる');

-- =========================================================
-- 結果の確認（postgres として）
-- =========================================================
reset role;

select is(
  (select count(*)::int from lantern_events where kind = 'publish' and source_id = '22220000-0000-4000-8000-000000000001'),
  1,
  '公開 +10 は台帳に1回だけ記録される'
);
select is(
  (select count(*)::int from verifications where verification_request_id = '33330000-0000-4000-8000-000000000004'),
  1,
  '同じ依頼の確認は1行だけ（verification_request_id 付き）'
);
select is(
  (select lantern_points from users where id = '11110000-0000-4000-8000-00000000000a'),
  -- 公開 S1 +10、確認 R4 +5、復帰 R5new +5、cron による S6 公開 +10
  30,
  '投稿者のポイントは台帳の合計と一致する（二重加算なし）'
);
select is(
  (select status from spots where id = '22220000-0000-4000-8000-000000000002'),
  'expired',
  'cron: 期限を過ぎた pending（承認なし）は expired'
);
select is(
  (select status from spots where id = '22220000-0000-4000-8000-000000000006'),
  'published',
  'cron: 期限前に2人の承認が成立していた pending は、実行が期限後でも published'
);

select * from finish();

rollback;
