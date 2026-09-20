-- 0009_contact_messages.sql（docs/SPEC.md §9.17 お問い合わせ）を検証する pgTAP テスト。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 役割の切り替えは 0006_security.sql / 0007_home_city.sql と同じく `set local role` と
-- `request.jwt.claims` で行い、最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- =========================================================
-- テストデータ（postgres として作成）
--   街 C1、利用者 M、スポット SP（published）/ SQ（pending）
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('cccc0000-0000-4000-8000-000000000001', 'contact-test-city', '問合せ街', 'といあわせまち', false, 43.06, 141.35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('44440000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contact-m@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
  ('44440000-0000-4000-8000-00000000000a', 'テストM', 'cccc0000-0000-4000-8000-000000000001', '北', 3, 0);

insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('55550000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000001', 'SP', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '44440000-0000-4000-8000-00000000000a', 'published', now() - interval '100 days', now() - interval '95 days'),
  ('55550000-0000-4000-8000-000000000002', 'cccc0000-0000-4000-8000-000000000001', 'SQ', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '44440000-0000-4000-8000-00000000000a', 'pending', now(), null);

-- =========================================================
-- 表と権限
-- =========================================================
select has_table('public', 'contact_messages', '表 contact_messages がある');

select is(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.contact_messages'::regclass),
  true,
  'contact_messages は RLS が有効'
);

select is(
  (select count(*)::int from pg_catalog.pg_policies p
   where p.schemaname = 'public' and p.tablename = 'contact_messages'),
  0,
  'contact_messages にポリシーは1つも無い（利用者からは読めない）'
);

select ok(
  not has_table_privilege('anon', 'public.contact_messages', 'SELECT')
  and not has_table_privilege('anon', 'public.contact_messages', 'INSERT')
  and not has_table_privilege('anon', 'public.contact_messages', 'UPDATE')
  and not has_table_privilege('anon', 'public.contact_messages', 'DELETE'),
  '権限表: anon は contact_messages に一切アクセスできない'
);
select ok(
  not has_table_privilege('authenticated', 'public.contact_messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.contact_messages', 'INSERT')
  and not has_table_privilege('authenticated', 'public.contact_messages', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.contact_messages', 'DELETE'),
  '権限表: authenticated も contact_messages に一切アクセスできない'
);
select ok(
  has_table_privilege('service_role', 'public.contact_messages', 'SELECT')
  and has_table_privilege('service_role', 'public.contact_messages', 'UPDATE'),
  '権限表: service_role（運営）は読めて、状態を更新できる'
);
select ok(
  has_function_privilege('anon', 'public.submit_contact_message(text,text,text,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.submit_contact_message(text,text,text,uuid)', 'EXECUTE'),
  '権限表: submit_contact_message は anon / authenticated が実行できる'
);
select is(
  (select p.prosecdef from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_contact_message'),
  true,
  'submit_contact_message は security definer'
);
select ok(
  (select p.proconfig from pg_catalog.pg_proc p
   join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_contact_message') @> array['search_path=""'],
  'submit_contact_message は search_path='''' を固定している'
);

-- =========================================================
-- 匿名（anon）からの直接アクセスと入力検査
-- =========================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select throws_ok(
  $$ select count(*) from public.contact_messages $$,
  '42501', null,
  '匿名: contact_messages を直接 select できない'
);
select throws_ok(
  $$ insert into public.contact_messages (category, message) values ('other', '直接') $$,
  '42501', null,
  '匿名: contact_messages へ直接 insert できない'
);

select throws_ok(
  $$ select public.submit_contact_message('spam', '本文', null, null) $$,
  '22023', '用件を選んでください',
  '用件が一覧にない値は拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message(null, '本文', null, null) $$,
  '22023', '用件を選んでください',
  '用件が NULL なら拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '', null, null) $$,
  '22023', 'お問い合わせの内容を入力してください',
  '本文が空なら拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '　 ' || chr(10), null, null) $$,
  '22023', 'お問い合わせの内容を入力してください',
  '本文が空白（全角空白・改行を含む）だけなら拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', repeat('あ', 2001), null, null) $$,
  '22023', 'お問い合わせの内容は2000字以内で入力してください',
  '本文が2001字なら拒否する'
);
select lives_ok(
  $$ select public.submit_contact_message('other', repeat('い', 2000), null, null) $$,
  '本文が2000字ちょうどなら受け付ける'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '本文', 'example.com', null) $$,
  '22023', 'メールアドレスの形をご確認ください',
  '返信先に @ が無ければ拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '本文', repeat('a', 320) || '@example.com', null) $$,
  '22023', 'メールアドレスの形をご確認ください',
  '返信先が320字を超えれば拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('removal', '本文', null, '55550000-0000-4000-8000-0000000000ff') $$,
  'P0002', 'お店の情報が取得できませんでした',
  '存在しないスポットは拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('removal', '本文', null, '55550000-0000-4000-8000-000000000002') $$,
  'P0002', 'お店の情報が取得できませんでした',
  '公開されていない（pending）スポットは拒否する'
);

-- =========================================================
-- 正常系と二重送信
-- =========================================================
select isnt(
  public.submit_contact_message('removal', 'この店の掲載を止めてください。', ' owner@example.com ', '55550000-0000-4000-8000-000000000001'),
  null::uuid,
  '正常系: 保存して id を返す'
);
select is(
  public.submit_contact_message('removal', 'この店の掲載を止めてください。', null, null),
  null::uuid,
  '直近1分以内の同じ内容は保存せず null を返す'
);
select isnt(
  public.submit_contact_message('removal', '別の店の掲載を止めてください。', null, null),
  null::uuid,
  '内容が違えば保存する'
);

reset role;

select is(
  (select count(*)::int from contact_messages where category = 'removal'),
  2,
  '同じ内容の2回目は行が増えていない'
);
select is(
  (select reply_to from contact_messages where message = 'この店の掲載を止めてください。'),
  'owner@example.com',
  '返信先は前後の空白を除いて保存する'
);
select is(
  (select spot_id from contact_messages where message = 'この店の掲載を止めてください。'),
  '55550000-0000-4000-8000-000000000001'::uuid,
  '対象のスポットを保存する'
);
select is(
  (select status from contact_messages where message = 'この店の掲載を止めてください。'),
  'new',
  '受け付けた直後の状態は new'
);

select * from finish();
rollback;
