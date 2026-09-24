-- 0006_security_hardening.sql の権限表と DB 関数の規則（docs/SPEC.md §9.13）を検証する pgTAP テスト。
--
-- 実行方法（Docker Desktop と Supabase CLI が必要）:
--   npx supabase start
--   npx supabase db reset      -- migrations 0001〜0006 と seed.sql を適用
--   npx supabase test db       -- supabase/tests/*.sql を pgTAP で実行
--
-- 役割の切り替えは Supabase の流儀に合わせ、`set local role` と `request.jwt.claims`（auth.uid() の元）で行う。
-- テスト用のデータは固定の UUID で作り、最後に rollback するので seed には影響しない。
-- 同時回答・承認と cron の競合（SPEC §9.13.7・§9.13.8）は、2接続を使う supabase/tests/0006_concurrency.sql で検証する。

begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

-- =========================================================
-- テストデータ（postgres として作成）
--   街: T1（投稿先）, T2（別の街）
--   利用者: A（T1・投稿者）, B / C（T1・同じ街。スポットなし）, D（T2・別の街。スポットなし）,
--           E（T1。expired のスポットだけ）, F（T2。T2 の pending スポットだけ）
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
  ('11110000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-d@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('11110000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-e@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('11110000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'test-f@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
  ('11110000-0000-4000-8000-00000000000a', 'テストA', 'aaaa0000-0000-4000-8000-000000000001', '北', 10, 0),
  ('11110000-0000-4000-8000-00000000000b', 'テストB', 'aaaa0000-0000-4000-8000-000000000001', '南', 5, 0),
  ('11110000-0000-4000-8000-00000000000c', 'テストC', 'aaaa0000-0000-4000-8000-000000000001', '東', 3, 0),
  ('11110000-0000-4000-8000-00000000000d', 'テストD', 'aaaa0000-0000-4000-8000-000000000002', '西', 7, 0),
  ('11110000-0000-4000-8000-00000000000e', 'テストE', 'aaaa0000-0000-4000-8000-000000000001', '中央', 2, 0),
  ('11110000-0000-4000-8000-00000000000f', 'テストF', 'aaaa0000-0000-4000-8000-000000000002', '港', 4, 0);

-- スポット
--   S1: A の pending（今作成）          → 承認の流れ
--   S2: A の pending（30日+1時間前に作成）→ 期限切れ承認の拒否・cron で expired
--   S3: A の published、open 依頼 R3 は期限前（now + 90日）
--   S4: A の published、open 依頼 R4 は期限到来済み（now - 1日）
--   S5: A の dormant、missed 依頼 R5old（古い）と R5new（最新）
--   S6: A の pending（31日前に作成）、期限内に2人の承認済み → cron が後でも公開
--   S7: E の expired（T1）
--   S8: F の pending（T2）
insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('22220000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001', 'S1', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'pending',   now(), null),
  ('22220000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000001', 'S2', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'pending',   now() - interval '30 days 1 hour', null),
  ('22220000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000001', 'S3', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'published', now() - interval '100 days', now() - interval '95 days'),
  ('22220000-0000-4000-8000-000000000004', 'aaaa0000-0000-4000-8000-000000000001', 'S4', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'published', now() - interval '100 days', now() - interval '95 days'),
  ('22220000-0000-4000-8000-000000000005', 'aaaa0000-0000-4000-8000-000000000001', 'S5', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'dormant',   now() - interval '600 days', now() - interval '590 days'),
  ('22220000-0000-4000-8000-000000000006', 'aaaa0000-0000-4000-8000-000000000001', 'S6', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000a', 'pending',   now() - interval '31 days', null),
  ('22220000-0000-4000-8000-000000000007', 'aaaa0000-0000-4000-8000-000000000001', 'S7', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '11110000-0000-4000-8000-00000000000e', 'expired',   now() - interval '60 days', null),
  ('22220000-0000-4000-8000-000000000008', 'aaaa0000-0000-4000-8000-000000000002', 'S8', '理由', 'weekly', 'SRID=4326;POINT(140.99 43.19)', '11110000-0000-4000-8000-00000000000f', 'pending',   now(), null);

insert into verification_requests (id, spot_id, user_id, due_at, status, created_at) values
  ('33330000-0000-4000-8000-000000000003', '22220000-0000-4000-8000-000000000003', '11110000-0000-4000-8000-00000000000a', now() + interval '90 days', 'open',   now() - interval '1 day'),
  ('33330000-0000-4000-8000-000000000004', '22220000-0000-4000-8000-000000000004', '11110000-0000-4000-8000-00000000000a', now() - interval '1 day',   'open',   now() - interval '91 days'),
  ('33330000-0000-4000-8000-000000000051', '22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', now() - interval '400 days', 'missed', now() - interval '490 days'),
  ('33330000-0000-4000-8000-000000000052', '22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', now() - interval '200 days', 'missed', now() - interval '290 days'),
  ('33330000-0000-4000-8000-000000000050', '22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', now() - interval '500 days', 'answered', now() - interval '590 days');

insert into endorsements (spot_id, user_id, created_at) values
  ('22220000-0000-4000-8000-000000000006', '11110000-0000-4000-8000-00000000000b', now() - interval '30 days'),
  ('22220000-0000-4000-8000-000000000006', '11110000-0000-4000-8000-00000000000c', now() - interval '29 days');

insert into verifications (spot_id, user_id, answer, created_at, verification_request_id) values
  ('22220000-0000-4000-8000-000000000005', '11110000-0000-4000-8000-00000000000a', 'quiet', now() - interval '500 days', '33330000-0000-4000-8000-000000000050');

-- バッジ（seed で入っていれば再利用）: A（公開中スポットの投稿者）と B（スポットなし）に keeper
insert into badges (slug, glyph, label) values ('keeper', '灯', 'テスト用')
on conflict (slug) do nothing;
insert into user_badges (user_id, badge_id)
select u.id, b.id
from badges b
cross join (values
  ('11110000-0000-4000-8000-00000000000a'::uuid),
  ('11110000-0000-4000-8000-00000000000b'::uuid)
) as u(id)
where b.slug = 'keeper'
on conflict do nothing;

-- =========================================================
-- 確認は必ず依頼に紐づく（§9.13.2）
-- =========================================================
select col_not_null('public', 'verifications', 'verification_request_id', 'verifications.verification_request_id は NOT NULL');
select throws_ok(
  $$ insert into verifications (spot_id, user_id, answer) values ('22220000-0000-4000-8000-000000000004', '11110000-0000-4000-8000-00000000000a', 'quiet') $$,
  '23502',
  null,
  '依頼に紐づかない確認は（postgres でも）入れられない'
);

-- =========================================================
-- 権限表（SPEC §9.13.8。postgres として has_*_privilege で検査）
-- =========================================================
select is_empty(
  $$
    with roles(role_name) as (values ('public'), ('anon'), ('authenticated'), ('service_role')),
    objects(obj) as (values
      ('public.cities'), ('public.tags'), ('public.badges'), ('public.spots'), ('public.spot_tags'),
      ('public.endorsements'), ('public.verifications'), ('public.users'), ('public.public_profiles'),
      ('public.user_badges'), ('public.verification_requests'), ('public.lantern_events'), ('public.bookmarks')
    ),
    privs(priv) as (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')),
    expected as (
      select r.role_name, o.obj, p.priv,
        case r.role_name
          -- 0011（§9.18）: endorsements は表単位ではなく列単位（user_id 以外）の SELECT だけ。
          when 'anon' then
            p.priv = 'SELECT'
            and o.obj not in ('public.verification_requests', 'public.lantern_events', 'public.bookmarks', 'public.endorsements')
          when 'authenticated' then
            (p.priv = 'SELECT' and o.obj <> 'public.endorsements')
            or (o.obj = 'public.bookmarks' and p.priv in ('INSERT', 'UPDATE', 'DELETE'))
          when 'service_role' then
            (o.obj = 'public.public_profiles' and p.priv = 'SELECT')
            or (o.obj <> 'public.public_profiles' and p.priv in ('SELECT', 'INSERT', 'UPDATE', 'DELETE'))
          else false
        end as allowed
      from roles r cross join objects o cross join privs p
    )
    select role_name, obj, priv, allowed
    from expected
    where has_table_privilege(role_name, obj, priv) <> allowed
  $$,
  '権限表: 表・ビューの権限が PUBLIC / anon / authenticated / service_role ごとに期待どおり'
);

select is_empty(
  $$
    with roles(role_name) as (values ('public'), ('anon'), ('authenticated'), ('service_role')),
    cols(col) as (values
      ('id'), ('display_name'), ('avatar_url'), ('home_city_id'), ('resident_years'),
      ('lantern_points'), ('area_name'), ('created_at'), ('home_city_changed_at')
    ),
    privs(priv) as (values ('INSERT'), ('UPDATE')),
    expected as (
      select r.role_name, c.col, p.priv,
        case r.role_name
          when 'authenticated' then
            -- 0007（§9.16）: home_city_id は set_home_city / initialize_home_city だけで変える（直接の insert / update は不可）。
            -- 0011（§9.18）: users へは直接 insert / update できない。行の作成は ensure_user_profile、
            -- 表示名は set_display_name だけ（avatar_url・resident_years も画面から設定しないので外した）。
            false
          when 'service_role' then true
          else false
        end as allowed
      from roles r cross join cols c cross join privs p
    )
    select role_name, col, priv, allowed
    from expected
    where has_column_privilege(role_name, 'public.users', col, priv) <> allowed
  $$,
  '権限表: users の列単位の insert / update（0011 以降、利用者はどの列も直接は不可）'
);

select is_empty(
  $$
    with fns(fn, anon_ok, auth_ok, service_ok) as (values
      ('public.create_spot(uuid, text, text, double precision, double precision, text)', false, true, false),
      ('public.endorse_spot(uuid)', false, true, false),
      ('public.answer_verification(uuid, text, text)', false, true, false),
      ('public.run_verification_cron()', false, false, true),
      ('public.is_profile_visible(uuid)', true, true, true),
      ('public.award_lantern_points(uuid, text, uuid, integer)', false, false, false),
      ('public.publish_pending_spot(uuid, timestamp with time zone)', false, false, false),
      ('public.set_home_city(uuid)', false, true, false),
      ('public.initialize_home_city(uuid)', false, true, false),
      -- §9.18 表示名・掲載停止リスト（0011）。
      ('public.ensure_user_profile()', false, true, false),
      ('public.set_display_name(text)', false, true, false),
      ('public.remove_place(uuid, text)', false, false, true),
      -- §9.17 お問い合わせ（0010）。Server Action がサーバー専用の service_role 接続で呼ぶ。
      ('public.submit_contact_message(text, text, text, uuid, text, uuid, text)', false, false, true),
      ('public.purge_expired_contact_data()', false, false, true)
    )
    select f.fn, e.role_name, e.allowed
    from fns f
    cross join lateral (values
      ('public', false), ('anon', f.anon_ok), ('authenticated', f.auth_ok), ('service_role', f.service_ok)
    ) as e(role_name, allowed)
    where has_function_privilege(e.role_name, f.fn, 'EXECUTE') <> e.allowed
  $$,
  '権限表: DB 関数の EXECUTE がロールごとに期待どおり（内部関数は誰にも不可）'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
      and p.proname not in (
        'create_spot', 'endorse_spot', 'answer_verification', 'run_verification_cron',
        'is_profile_visible', 'award_lantern_points', 'publish_pending_spot', 'set_home_city',
        'initialize_home_city',
        -- §9.18（0011）。authenticated が実行できる（権限の詳細は 0011_profile_privacy_and_removed_places.sql）。
        'ensure_user_profile', 'set_display_name'
      )
      and (
        has_function_privilege('public', p.oid, 'EXECUTE')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  $$,
  '権限表: 一覧に無い public の関数は PUBLIC / anon / authenticated から実行できない'
);

select is_empty(
  $$
    select c.oid::regclass::text
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
      and c.relname not in (
        'cities', 'tags', 'badges', 'spots', 'spot_tags', 'endorsements', 'verifications', 'users',
        'public_profiles', 'user_badges', 'verification_requests', 'lantern_events', 'bookmarks'
      )
      and (
        has_table_privilege('public', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      )
  $$,
  '権限表: 一覧に無い public の表・ビューは PUBLIC / anon / authenticated から使えない'
);

select is_empty(
  $$
    select role_name
    from (values ('public'), ('anon'), ('authenticated')) as v(role_name)
    where has_schema_privilege(role_name, 'public', 'CREATE')
  $$,
  '権限表: public スキーマへの CREATE は PUBLIC / anon / authenticated に無い'
);

select ok(
  (select 'security_barrier=true' = any(coalesce(c.reloptions, '{}'::text[]))
   from pg_class c where c.oid = 'public.public_profiles'::regclass),
  'public_profiles は security_barrier のビュー'
);

select is_empty(
  $$
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
      and not coalesce(
        'search_path=""' = any(p.proconfig) or 'search_path=' = any(p.proconfig),
        false
      )
  $$,
  'DB 関数はすべて search_path = '''' で固定されている'
);

select ok(
  position(
    format('%I.st_makepoint(', (
      select n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'postgis'
    ))
    in pg_get_functiondef('public.create_spot(uuid, text, text, double precision, double precision, text)'::regprocedure)
  ) > 0,
  'create_spot は PostGIS を実際のスキーマで修飾している'
);

-- =========================================================
-- 匿名（anon）
-- =========================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select is((select count(*)::int from users), 0, '匿名: users の行は1件も読めない');
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000a'),
  1,
  '匿名: 公開中スポットの投稿者は public_profiles で読める'
);
select throws_ok(
  $$ select lantern_points from public_profiles $$,
  '42703', null,
  '匿名: public_profiles に lantern_points 列は無い'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000b'),
  0,
  '匿名: スポットを持たない利用者は public_profiles に出ない'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000e'),
  0,
  '匿名: dormant / expired だけの投稿者は public_profiles に出ない'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000f'),
  0,
  '匿名: pending だけの投稿者は public_profiles に出ない'
);
select is(
  (select count(*)::int from user_badges where user_id = '11110000-0000-4000-8000-00000000000a'),
  1,
  '匿名: 公開中スポットの投稿者のバッジは読める'
);
select is(
  (select count(*)::int from user_badges where user_id = '11110000-0000-4000-8000-00000000000b'),
  0,
  '匿名: スポットを持たない利用者のバッジは読めない'
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
select throws_ok(
  $$ update users set display_name = 'テストA2', resident_years = 11 where id = '11110000-0000-4000-8000-00000000000a' $$,
  '42501', null,
  '投稿者: 表示名・居住年数も直接は更新できない（表示名は set_display_name だけ。SPEC §9.18）'
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
  '投稿者: 住んでいる街には create_spot できる（PostGIS の解決を含む）'
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
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000a'),
  1,
  '同じ街 B: 公開中スポットの投稿者 A は public_profiles に出る'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000b'),
  1,
  '同じ街 B: 本人は public_profiles に出る'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000c'),
  0,
  '同じ街 B: スポットを持たない他人 C は public_profiles に出ない'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000e'),
  0,
  '同じ街 B: expired だけの投稿者 E は public_profiles に出ない'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000f'),
  0,
  '同じ街 B: 別の街の pending の投稿者 F は public_profiles に出ない'
);
select is(
  (select count(*)::int from user_badges where user_id = '11110000-0000-4000-8000-00000000000b'),
  1,
  '同じ街 B: 本人のバッジは読める'
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
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000f'),
  1,
  '別の街 D: 自分の街の pending の投稿者 F は public_profiles に出る'
);
select is(
  (select count(*)::int from public_profiles where id = '11110000-0000-4000-8000-00000000000b'),
  0,
  '別の街 D: スポットを持たない利用者 B は public_profiles に出ない'
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
