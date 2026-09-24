-- 0011_profile_privacy_and_removed_places.sql（docs/SPEC.md §9.18）を検証する pgTAP テスト。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 役割の切り替えは 0006_security.sql と同じく `set local role` と `request.jwt.claims` で行い、
-- 最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(66);

-- =========================================================
-- テストデータ（postgres として作成）
--   街 T（投稿先）
--   利用者 P: 表示名がメールの @ 前と同じ（置き換わる）
--          Q: 表示名がメールと無関係（そのまま）
--          R: 表示名がメールの @ 前に似ているが一致しない（そのまま）
--          N: auth.users だけ（プロフィール行はログイン時に作る）
--          A: T に住む投稿者
--   スポット SP: A の published（open 依頼あり）。remove_place の対象
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('dddd0000-0000-4000-8000-000000000001', 'privacy-test-city', '表示名街', 'ひょうじめいまち', false, 43.06, 141.35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('66660000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hanako.p@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('66660000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'q-user@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('66660000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ryo@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('66660000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'newcomer@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('66660000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'author-a@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, avatar_url, lantern_points) values
  ('66660000-0000-4000-8000-00000000000a', 'hanako.p', 'dddd0000-0000-4000-8000-000000000001', null, null, null, 0),
  ('66660000-0000-4000-8000-00000000000b', 'キュー', 'dddd0000-0000-4000-8000-000000000001', null, null, null, 0),
  ('66660000-0000-4000-8000-00000000000c', 'ryo2', 'dddd0000-0000-4000-8000-000000000001', null, null, null, 0),
  ('66660000-0000-4000-8000-00000000000e', 'テストA', 'dddd0000-0000-4000-8000-000000000001', '北', 3, 'https://example.invalid/a.png', 0);

insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('77770000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000001', '外す店 本店', '理由', 'weekly', 'SRID=4326;POINT(141.36 43.07)', '66660000-0000-4000-8000-00000000000e', 'published', now() - interval '100 days', now() - interval '95 days');

insert into verification_requests (id, spot_id, user_id, due_at, status) values
  ('88880000-0000-4000-8000-000000000001', '77770000-0000-4000-8000-000000000001', '66660000-0000-4000-8000-00000000000e', now() + interval '10 days', 'open');

-- =========================================================
-- 1. メールアドレス由来の表示名の置き換え（既存の利用者）
-- =========================================================
select has_function('public', 'replace_email_derived_display_names', array[]::text[], '関数 replace_email_derived_display_names がある');
select is(public.replace_email_derived_display_names(), 1, '置き換えは @ 前と一致する行だけ（1件）');
select is(
  (select display_name from users where id = '66660000-0000-4000-8000-00000000000a'),
  '地元の人',
  'メールの @ 前と同じ表示名は「地元の人」に置き換わる'
);
select is(
  (select display_name from users where id = '66660000-0000-4000-8000-00000000000b'),
  'キュー',
  'メールと無関係な表示名はそのまま'
);
select is(
  (select display_name from users where id = '66660000-0000-4000-8000-00000000000c'),
  'ryo2',
  '@ 前に似ているが一致しない表示名はそのまま'
);

-- =========================================================
-- 2. 公開プロフィールと users の列権限
-- =========================================================
select hasnt_column('public', 'public_profiles', 'avatar_url', 'public_profiles に avatar_url は無い');
select has_column('public', 'public_profiles', 'display_name', 'public_profiles に display_name はある');
select is(
  (select c.reloptions @> array['security_barrier=true'] from pg_class c where c.oid = 'public.public_profiles'::regclass),
  true,
  'public_profiles は作り直しても security_barrier のビュー'
);
select ok(has_table_privilege('anon', 'public.public_profiles', 'SELECT'), 'anon は作り直した public_profiles を読める');
select ok(has_table_privilege('authenticated', 'public.public_profiles', 'SELECT'), 'authenticated は作り直した public_profiles を読める');
select ok(has_table_privilege('service_role', 'public.public_profiles', 'SELECT'), 'service_role は作り直した public_profiles を読める');

select is_empty(
  $$
    select c.col, p.priv
    from (values ('id'), ('display_name'), ('avatar_url'), ('area_name'), ('resident_years'), ('home_city_id'),
                 ('lantern_points'), ('created_at'), ('home_city_changed_at')) as c(col)
    cross join (values ('INSERT'), ('UPDATE')) as p(priv)
    where has_column_privilege('authenticated', 'public.users', c.col, p.priv)
  $$,
  'authenticated は users のどの列も直接 insert / update できない（表示名は set_display_name、行は ensure_user_profile）'
);

-- =========================================================
-- 3. 関数の EXECUTE 権限
-- =========================================================
select is_empty(
  $$
    with fns(fn, anon_ok, auth_ok, service_ok) as (values
      ('public.set_display_name(text)', false, true, false),
      ('public.ensure_user_profile()', false, true, false),
      ('public.remove_place(uuid, text)', false, false, true),
      ('public.normalize_place_name(text)', false, false, false),
      ('public.replace_email_derived_display_names()', false, false, false)
    )
    select f.fn, e.role_name, e.allowed
    from fns f
    cross join lateral (values
      ('public', false), ('anon', f.anon_ok), ('authenticated', f.auth_ok), ('service_role', f.service_ok)
    ) as e(role_name, allowed)
    where has_function_privilege(e.role_name, f.fn, 'EXECUTE') <> e.allowed
  $$,
  '0011 の関数の EXECUTE がロールごとに期待どおり'
);
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.set_display_name(text)'::regprocedure),
  true,
  'set_display_name は security definer・search_path 空'
);
select is(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.remove_place(uuid, text)'::regprocedure),
  true,
  'remove_place は security definer・search_path 空'
);

-- =========================================================
-- 4. 店名の正規化
-- =========================================================
select is(
  (select p.provolatile::text from pg_proc p where p.oid = 'public.normalize_place_name(text)'::regprocedure),
  'i',
  'normalize_place_name は immutable'
);
select is(public.normalize_place_name('喫茶 ＵＲＡ・ｽﾎﾟ'), '喫茶uraスポ', '全角英字・半角カナ・空白・中黒を揃える');
select is(public.normalize_place_name('Cafe　 URA'), 'cafeura', '大文字小文字・全角空白を揃える');
select is(public.normalize_place_name('ウラ（喫茶）-店.'), 'ウラ喫茶店', '括弧・ハイフン・ピリオドを除く');
select is(public.normalize_place_name('コーヒー'), 'コーヒー', '長音記号は残す');

-- =========================================================
-- 5. 掲載停止リスト removed_places
-- =========================================================
select has_table('public', 'removed_places', '表 removed_places がある');
select is(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.removed_places'::regclass),
  true,
  'removed_places は RLS 有効'
);
select is_empty(
  $$
    select r.role_name, p.priv
    from (values ('public'), ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
    where has_table_privilege(r.role_name, 'public.removed_places', p.priv)
  $$,
  'removed_places は PUBLIC / anon / authenticated に一切の権限が無い'
);
select ok(
  has_table_privilege('service_role', 'public.removed_places', 'SELECT,INSERT,UPDATE,DELETE'),
  'service_role（運営）は removed_places を読み書きできる'
);

-- 運営が画面から入れた店名も、保存時に正規化される
insert into removed_places (name_normalized, lat, lng, note) values ('ウラ 喫茶', 43.06, 141.35, 'テスト');
select is(
  (select name_normalized from removed_places where note = 'テスト'),
  'ウラ喫茶',
  'removed_places の name_normalized は保存時に正規化される'
);

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok($$ select * from removed_places $$, '42501', null, '匿名: removed_places を読めない');
select throws_ok(
  $$ insert into removed_places (name_normalized, lat, lng) values ('x', 43.0, 141.0) $$,
  '42501', null, '匿名: removed_places に書けない'
);
select throws_ok($$ select set_display_name('匿名') $$, '42501', null, '匿名: set_display_name を実行できない');
select throws_ok($$ select ensure_user_profile() $$, '42501', null, '匿名: ensure_user_profile を実行できない');
select throws_ok(
  $$ select remove_place('77770000-0000-4000-8000-000000000001', null) $$,
  '42501', null, '匿名: remove_place を実行できない'
);
select is(
  (select count(*)::int from public_profiles where id = '66660000-0000-4000-8000-00000000000e'),
  1,
  '匿名: 公開中スポットの投稿者は public_profiles で読める（列を絞った後も）'
);
select throws_ok($$ select avatar_url from public_profiles $$, '42703', null, '匿名: public_profiles から avatar_url は読めない');
select throws_ok($$ select user_id from endorsements $$, '42501', null, '匿名: endorsements の user_id（誰が承認したか）は読めない');
select lives_ok($$ select spot_id, created_at from endorsements $$, '匿名: endorsements の件数に使う spot_id は読める');
reset role;

-- =========================================================
-- 6. ログイン時のプロフィール作成（コールバック相当）: 初期値は「地元の人」
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"66660000-0000-4000-8000-00000000000d","role":"authenticated"}';
select lives_ok($$ select ensure_user_profile() $$, '新規: ensure_user_profile でプロフィール行を作れる');
select is(
  (select display_name from users where id = '66660000-0000-4000-8000-00000000000d'),
  '地元の人',
  '新規: 表示名の初期値は「地元の人」（メールアドレスの一部を使わない）'
);
select throws_ok($$ select * from removed_places $$, '42501', null, 'ログイン済み: removed_places を読めない');
select throws_ok($$ select user_id from endorsements $$, '42501', null, 'ログイン済み: 他人を含む endorsements の user_id は読めない');
select throws_ok(
  $$ insert into removed_places (name_normalized, lat, lng) values ('x', 43.0, 141.0) $$,
  '42501', null, 'ログイン済み: removed_places に書けない'
);
select throws_ok(
  $$ update users set display_name = 'foo@example.com' where id = '66660000-0000-4000-8000-00000000000d' $$,
  '42501', null, 'ログイン済み: 表示名を直接 update できない（set_display_name だけ）'
);
select throws_ok(
  $$ update users set avatar_url = 'https://evil.invalid/x.png' where id = '66660000-0000-4000-8000-00000000000d' $$,
  '42501', null, 'ログイン済み: avatar_url を update できない'
);
select throws_ok(
  $$ update users set resident_years = 99 where id = '66660000-0000-4000-8000-00000000000d' $$,
  '42501', null, 'ログイン済み: resident_years を update できない'
);
select throws_ok(
  $$ select remove_place('77770000-0000-4000-8000-000000000001', null) $$,
  '42501', null, 'ログイン済み: remove_place を実行できない'
);

-- set_display_name の検査
select is(set_display_name('  灯りの人  '), '灯りの人', 'set_display_name: 前後の空白を除いて保存し、保存した名前を返す');
select is(
  (select display_name from users where id = '66660000-0000-4000-8000-00000000000d'),
  '灯りの人',
  'set_display_name: 本人の表示名が変わる'
);
select lives_ok($$ select ensure_user_profile() $$, 'ensure_user_profile は2回目も失敗しない');
select is(
  (select display_name from users where id = '66660000-0000-4000-8000-00000000000d'),
  '灯りの人',
  'ensure_user_profile は既存の表示名を上書きしない'
);
select throws_ok($$ select set_display_name('　 ') $$, '22023', '表示名を入力してください', 'set_display_name: 空白だけは不可');
select throws_ok($$ select set_display_name(null) $$, '22023', '表示名を入力してください', 'set_display_name: NULL は不可');
select is(set_display_name('あいうえおかきくけこさしすせそたちつてと'), 'あいうえおかきくけこさしすせそたちつてと', 'set_display_name: 20文字は可');
select throws_ok(
  $$ select set_display_name('あいうえおかきくけこさしすせそたちつてとな') $$,
  '22023', '表示名は20文字以内で入力してください', 'set_display_name: 21文字は不可'
);
select throws_ok(
  $$ select set_display_name(E'灯り\nの人') $$,
  '22023', '表示名に改行や制御文字は使えません', 'set_display_name: 改行は不可'
);
select throws_ok(
  $$ select set_display_name(E'灯り\tの人') $$,
  '22023', '表示名に改行や制御文字は使えません', 'set_display_name: 制御文字（タブ）は不可'
);
select throws_ok(
  $$ select set_display_name('foo@example.com') $$,
  '22023', '表示名にメールアドレスは使えません', 'set_display_name: メールアドレスの形は不可'
);
select throws_ok(
  $$ select set_display_name('foo＠example') $$,
  '22023', '表示名にメールアドレスは使えません', 'set_display_name: 全角の＠を使ったメールアドレスの形も不可'
);
reset role;

-- =========================================================
-- 7. create_spot は掲載停止の店を拒否する（正規化した店名が一致し、かつ 100m 以内）
--    removed_places: 'ウラ喫茶'（43.06, 141.35）
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"66660000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok(
  $$ select create_spot('dddd0000-0000-4000-8000-000000000001', 'ウラ・喫茶', '理由', 43.06, 141.35, 'weekly') $$,
  '42501', 'この店は掲載を控えています。',
  'create_spot: 同名（表記ゆれ）・同じ場所は拒否'
);
select throws_ok(
  $$ select create_spot('dddd0000-0000-4000-8000-000000000001', 'ｳﾗ喫茶', '理由', 43.06045, 141.35, 'weekly') $$,
  '42501', 'この店は掲載を控えています。',
  'create_spot: 同名・約50m 先は拒否'
);
select isnt(
  create_spot('dddd0000-0000-4000-8000-000000000001', 'ウラ喫茶', '理由', 43.0618, 141.35, 'weekly'),
  null,
  'create_spot: 同名でも約200m 離れていれば通る'
);
select isnt(
  create_spot('dddd0000-0000-4000-8000-000000000001', '表喫茶', '理由', 43.06, 141.35, 'weekly'),
  null,
  'create_spot: 同じ場所でも別名なら通る'
);
select throws_ok(
  $$ select create_spot('dddd0000-0000-4000-8000-000000000001', '', '理由', 43.06, 141.35, 'weekly') $$,
  '22023', '店の名前は80字以内で入力してください',
  'create_spot: 既存の入力検査は維持'
);
reset role;

-- =========================================================
-- 8. remove_place（service_role のみ）
-- =========================================================
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select lives_ok(
  $$ select remove_place('77770000-0000-4000-8000-000000000001', '店舗からの申し出') $$,
  'service_role: remove_place を実行できる'
);
reset role;
select is(
  (select status from spots where id = '77770000-0000-4000-8000-000000000001'),
  'expired',
  'remove_place: スポットは expired（地図に出ない）になる'
);
select is(
  (select count(*)::int from removed_places where name_normalized = '外す店本店' and note = '店舗からの申し出'
     and abs(lat - 43.07) < 1e-9 and abs(lng - 141.36) < 1e-9),
  1,
  'remove_place: 正規化した店名と位置を removed_places に記録する'
);
select is(
  (select status from verification_requests where id = '88880000-0000-4000-8000-000000000001'),
  'missed',
  'remove_place: open の確認依頼は閉じる'
);
select throws_ok(
  $$ update spots set status = 'published' where id = '77770000-0000-4000-8000-000000000001' $$,
  '42501', 'この店は掲載を控えています。',
  '掲載停止の店は、どの経路でも published に戻せない'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"66660000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok(
  $$ select create_spot('dddd0000-0000-4000-8000-000000000001', '外す店 本店', '理由', 43.07, 141.36, 'weekly') $$,
  '42501', 'この店は掲載を控えています。',
  'remove_place の後は、同じ店を create_spot で再掲載できない'
);
reset role;

select * from finish();

rollback;
