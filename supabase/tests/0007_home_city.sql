-- 0007_home_city_change_limit.sql（docs/SPEC.md §9.16 住んでいる街の変更）を検証する pgTAP テスト。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 役割の切り替えは 0006_security.sql と同じく `set local role` と `request.jwt.claims` で行い、最後に rollback する。
-- 同時に2回変えようとしたときの行ロック（for update）は 0007_home_city_concurrency.sql、
-- 初回設定（initialize_home_city）の同時実行は 0007_home_city_initialize_concurrency.sql（2接続）で検証する。

begin;

create extension if not exists pgtap with schema extensions;

select plan(47);

-- =========================================================
-- テストデータ（postgres として作成）
--   街: H1 / H2 / H3
--   利用者: G（住んでいる街が未設定）, H（H1 在住・未変更）,
--           I（街だけ NULL・変更日時あり。set_home_city の初回分岐用）,
--           J（街だけ NULL・変更日時あり。initialize_home_city 用）,
--           K（auth.users はあるが public.users のプロフィール行が無い。R14 軽微1の検証用）
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('bbbb0000-0000-4000-8000-000000000001', 'hc-test-city-1', '街テスト1', 'まちてすと1', false, 43.06, 141.35),
  ('bbbb0000-0000-4000-8000-000000000002', 'hc-test-city-2', '街テスト2', 'まちてすと2', true, 43.19, 140.99),
  ('bbbb0000-0000-4000-8000-000000000003', 'hc-test-city-3', '街テスト3', 'まちてすと3', false, 42.92, 143.20);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('33330000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-g@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('33330000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-h@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('33330000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-i@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('33330000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-j@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
  ('33330000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-k@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
  ('33330000-0000-4000-8000-00000000000a', 'テストG', null, null, null, 0),
  ('33330000-0000-4000-8000-00000000000b', 'テストH', 'bbbb0000-0000-4000-8000-000000000001', '北', 3, 0),
  ('33330000-0000-4000-8000-00000000000c', 'テストI', null, null, null, 0),
  ('33330000-0000-4000-8000-00000000000d', 'テストJ', null, null, null, 0);

-- 都市の削除（on delete set null）や管理者操作で「街だけ NULL・変更日時あり」になった行を作る
update users set home_city_changed_at = now() - interval '10 days'
where id in ('33330000-0000-4000-8000-00000000000c', '33330000-0000-4000-8000-00000000000d');

-- =========================================================
-- 権限表
-- =========================================================
select ok(
  has_column_privilege('authenticated', 'public.users', 'home_city_changed_at', 'SELECT'),
  '権限表: authenticated は home_city_changed_at を読める'
);
select ok(
  not has_column_privilege('authenticated', 'public.users', 'home_city_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.users', 'home_city_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.users', 'home_city_changed_at', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.users', 'home_city_changed_at', 'INSERT'),
  '権限表: authenticated は home_city_id / home_city_changed_at を直接 insert / update できない'
);
select ok(
  has_function_privilege('authenticated', 'public.set_home_city(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.set_home_city(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.set_home_city(uuid)', 'EXECUTE'),
  '権限表: set_home_city の EXECUTE は authenticated だけ'
);
select ok(
  (
    select coalesce('search_path=""' = any(p.proconfig) or 'search_path=' = any(p.proconfig), false) and p.prosecdef
    from pg_proc p
    where p.oid = 'public.set_home_city(uuid)'::regprocedure
  ),
  'set_home_city は security definer で search_path = '''' に固定されている'
);
select ok(
  has_function_privilege('authenticated', 'public.initialize_home_city(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.initialize_home_city(uuid)', 'EXECUTE')
  and not has_function_privilege('public', 'public.initialize_home_city(uuid)', 'EXECUTE'),
  '権限表: initialize_home_city の EXECUTE は authenticated だけ'
);
select ok(
  (
    select coalesce('search_path=""' = any(p.proconfig) or 'search_path=' = any(p.proconfig), false) and p.prosecdef
    from pg_proc p
    where p.oid = 'public.initialize_home_city(uuid)'::regprocedure
  ),
  'initialize_home_city は security definer で search_path = '''' に固定されている'
);

-- =========================================================
-- 匿名（anon）と未ログイン
-- =========================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-000000000001') $$,
  '42501', null,
  '匿名: set_home_city を実行できない'
);
select throws_ok(
  $$ select public.initialize_home_city('bbbb0000-0000-4000-8000-000000000001') $$,
  '42501', null,
  '匿名: initialize_home_city を実行できない'
);

set local role authenticated;
set local request.jwt.claims to '{"role":"authenticated"}';

select throws_ok(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-000000000001') $$,
  '42501', 'ログインが必要です',
  '未ログイン（sub なし）: 拒否する'
);
select throws_ok(
  $$ select public.initialize_home_city('bbbb0000-0000-4000-8000-000000000001') $$,
  '42501', 'ログインが必要です',
  '未ログイン（sub なし）: initialize_home_city も拒否する'
);

-- =========================================================
-- G: 初回設定・同じ街・変更・90日の制限
-- =========================================================
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';

select throws_ok(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-0000000000ff') $$,
  'P0002', '街の情報が取得できませんでした',
  '存在しない街は拒否する'
);
select throws_ok(
  $$ select public.set_home_city(null) $$,
  'P0002', '街の情報が取得できませんでした',
  '街の指定なし（NULL）は拒否する'
);

select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000001'),
  null::timestamptz,
  '初回設定: 戻り値は NULL'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000a'),
  'bbbb0000-0000-4000-8000-000000000001'::uuid,
  '初回設定: 住んでいる街が設定される'
);
select is(
  (select home_city_changed_at from users where id = '33330000-0000-4000-8000-00000000000a'),
  null::timestamptz,
  '初回設定: 制限に数えない（home_city_changed_at は NULL のまま）'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';

select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000001'),
  null::timestamptz,
  '同じ街: 何もしない（未変更のまま NULL を返す）'
);
select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000002'),
  now(),
  '別の街（初回設定の後の最初の変更）: 変更して now() を返す'
);
select throws_like(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-000000000003') $$,
  '住んでいる街は90日に1回まで変えられます%',
  '変えた直後の別の街への変更は拒否する'
);
select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000002'),
  now(),
  '制限中でも、同じ街は拒否せず何もしない（記録した時刻を返す）'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000a'),
  'bbbb0000-0000-4000-8000-000000000002'::uuid,
  '拒否された変更は反映されない'
);
select is(
  (select home_city_changed_at from users where id = '33330000-0000-4000-8000-00000000000a'),
  now(),
  '変更した時刻が記録される'
);

-- 89日23時間前に変えた → まだ変えられない
update users set home_city_changed_at = now() - interval '89 days 23 hours'
where id = '33330000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-000000000003') $$,
  'P0001', null,
  '90日以内（89日23時間前）の変更は拒否する'
);

-- 次に変えられる日（Asia/Tokyo）: 東京の0時ちょうどに変えたなら、その90日後の日付
reset role;
update users
set home_city_changed_at = (date_trunc('day', now() at time zone 'Asia/Tokyo') - interval '10 days') at time zone 'Asia/Tokyo'
where id = '33330000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-000000000003') $$,
  'P0001',
  '住んでいる街は90日に1回まで変えられます。次に変えられるのは'
    || to_char((now() at time zone 'Asia/Tokyo')::date + 80, 'YYYY"年"FMMM"月"FMDD"日"')
    || '以降です。',
  '拒否のメッセージに次に変えられる日（東京の日付）が入る'
);

-- 時刻の端数がある場合は翌日に切り上げる（「以降」が必ず正しくなるように）
reset role;
update users
set home_city_changed_at = (date_trunc('day', now() at time zone 'Asia/Tokyo') - interval '10 days' + interval '1 hour') at time zone 'Asia/Tokyo'
where id = '33330000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';
select throws_ok(
  $$ select public.set_home_city('bbbb0000-0000-4000-8000-000000000003') $$,
  'P0001',
  '住んでいる街は90日に1回まで変えられます。次に変えられるのは'
    || to_char((now() at time zone 'Asia/Tokyo')::date + 81, 'YYYY"年"FMMM"月"FMDD"日"')
    || '以降です。',
  '次に変えられる日は、時刻の端数を翌日へ切り上げる'
);

-- ちょうど90日前に変えた → 変えられる
reset role;
update users set home_city_changed_at = now() - interval '90 days'
where id = '33330000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000003'),
  now(),
  'ちょうど90日前に変えていれば、別の街へ変えられる'
);

-- 120日前に変えた → 変えられる
reset role;
update users set home_city_changed_at = now() - interval '120 days'
where id = '33330000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000001'),
  now(),
  '90日を超えて前に変えていれば、別の街へ変えられる'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000a'),
  'bbbb0000-0000-4000-8000-000000000001'::uuid,
  '90日を超えた変更が反映される'
);
select is(
  (select home_city_changed_at from users where id = '33330000-0000-4000-8000-00000000000a'),
  now(),
  '90日を超えた変更で、記録した時刻が更新される'
);

-- =========================================================
-- I: 「街だけ NULL・変更日時あり」の行を set_home_city で初回設定すると、変更日時も NULL に戻る
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000c","role":"authenticated"}';

select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000002'),
  null::timestamptz,
  '街だけ NULL の行: set_home_city は初回設定として NULL を返す'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000c'),
  'bbbb0000-0000-4000-8000-000000000002'::uuid,
  '街だけ NULL の行: 住んでいる街が設定される'
);
select is(
  (select home_city_changed_at from users where id = '33330000-0000-4000-8000-00000000000c'),
  null::timestamptz,
  '街だけ NULL の行: 初回設定で home_city_changed_at が NULL に戻る（古い制限が残らない）'
);

-- =========================================================
-- J: initialize_home_city（/start の初回設定。設定済みなら何もしない）
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000d","role":"authenticated"}';

select throws_ok(
  $$ select public.initialize_home_city('bbbb0000-0000-4000-8000-0000000000ff') $$,
  'P0002', '街の情報が取得できませんでした',
  'initialize_home_city: 存在しない街は拒否する'
);
select throws_ok(
  $$ select public.initialize_home_city(null) $$,
  'P0002', '街の情報が取得できませんでした',
  'initialize_home_city: 街の指定なし（NULL）は拒否する'
);
select is(
  public.initialize_home_city('bbbb0000-0000-4000-8000-000000000002'),
  true,
  'initialize_home_city: 未設定なら設定して true を返す'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000d'),
  'bbbb0000-0000-4000-8000-000000000002'::uuid,
  'initialize_home_city: 住んでいる街が設定される'
);
select is(
  (select home_city_changed_at from users where id = '33330000-0000-4000-8000-00000000000d'),
  null::timestamptz,
  'initialize_home_city: 制限に数えない（街だけ NULL・変更日時ありの行でも home_city_changed_at は NULL）'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000d","role":"authenticated"}';

select is(
  public.initialize_home_city('bbbb0000-0000-4000-8000-000000000003'),
  false,
  'initialize_home_city: 設定済みなら別の街を渡しても何もせず false を返す（例外にしない）'
);
select is(
  public.initialize_home_city('bbbb0000-0000-4000-8000-000000000002'),
  false,
  'initialize_home_city: 設定済みの同じ街でも false を返す'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000d'),
  'bbbb0000-0000-4000-8000-000000000002'::uuid,
  'initialize_home_city: 設定済みの住んでいる街は変わらない'
);
select is(
  (select home_city_changed_at from users where id = '33330000-0000-4000-8000-00000000000d'),
  null::timestamptz,
  'initialize_home_city: 設定済みの no-op でも変更日時を記録しない'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is(
  public.set_home_city('bbbb0000-0000-4000-8000-000000000003'),
  now(),
  'initialize_home_city の後の最初の変更は、90日の制限を受けずに /me から変えられる'
);
reset role;

-- =========================================================
-- K: プロフィール行が無い（データ不整合）場合、initialize_home_city は false ではなく例外を返す（R14 軽微1）
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000e","role":"authenticated"}';

select throws_ok(
  $$ select public.initialize_home_city('bbbb0000-0000-4000-8000-000000000001') $$,
  'P0002', 'プロフィールが見つかりません',
  'initialize_home_city: プロフィール行が無ければ「既に設定済み」と区別して例外にする'
);

reset role;
select is(
  (select count(*) from users where id = '33330000-0000-4000-8000-00000000000e')::int,
  0,
  'K: プロフィール行は作られない（例外で終わるだけ）'
);

-- =========================================================
-- H: 直接の書き換えは拒否（RPC だけ）
-- =========================================================
set local role authenticated;
set local request.jwt.claims to '{"sub":"33330000-0000-4000-8000-00000000000b","role":"authenticated"}';

select throws_ok(
  $$ update users set home_city_id = 'bbbb0000-0000-4000-8000-000000000002' where id = '33330000-0000-4000-8000-00000000000b' $$,
  '42501', null,
  'authenticated: home_city_id を直接 update できない'
);
select throws_ok(
  $$ update users set home_city_changed_at = null where id = '33330000-0000-4000-8000-00000000000b' $$,
  '42501', null,
  'authenticated: home_city_changed_at を直接 update できない'
);
select throws_ok(
  $$ insert into users (id, display_name, home_city_id) values ('33330000-0000-4000-8000-00000000000b', 'x', 'bbbb0000-0000-4000-8000-000000000002') on conflict do nothing $$,
  '42501', null,
  'authenticated: insert でも home_city_id を指定できない'
);

reset role;
select is(
  (select home_city_id from users where id = '33330000-0000-4000-8000-00000000000b'),
  'bbbb0000-0000-4000-8000-000000000001'::uuid,
  '直接の書き換えは反映されない'
);

select * from finish();

rollback;
