-- 0010_contact_hardening.sql（docs/SPEC.md §9.17）を検証する pgTAP テスト。
--   直接実行の禁止、送信元ごと・全体の回数制限、容量上限、重複排除の鍵、privacy の送信者か返信先の必須（0013）、
--   返信先メールアドレスの検査、User-Agent の切り詰め、保存期間（purge）の境界。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 最後に rollback する（seed には影響しない）。トランザクション内の now() は一定なので、
-- 「1年ちょうど」「24時間ちょうど」の境界をそのまま確かめられる。

begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- =========================================================
-- テストデータ（postgres として作成）
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
  ('cccc0000-0000-4000-8000-000000000010', 'contact-hardening-city', '濫用対策街', 'らんようたいさくまち', false, 43.06, 141.35);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('44440000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'contact-h@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
  ('44440000-0000-4000-8000-000000000010', 'テストH', 'cccc0000-0000-4000-8000-000000000010', '北', 3, 0);

insert into spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
  ('55550000-0000-4000-8000-000000000010', 'cccc0000-0000-4000-8000-000000000010', 'SH', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '44440000-0000-4000-8000-000000000010', 'published', now() - interval '100 days', now() - interval '95 days');

-- =========================================================
-- 表と権限
-- =========================================================
select has_table('public', 'contact_rate', '表 contact_rate がある');
select is(
  (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.contact_rate'::regclass),
  true,
  'contact_rate は RLS が有効'
);
select ok(
  not has_table_privilege('anon', 'public.contact_rate', 'SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated', 'public.contact_rate', 'SELECT,INSERT,UPDATE,DELETE'),
  '権限表: anon / authenticated は contact_rate に一切アクセスできない'
);
select has_column('public', 'contact_messages', 'requester_id', 'contact_messages に requester_id がある');

select ok(
  not has_function_privilege('anon', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE'),
  '権限表: submit_contact_message は anon / authenticated / PUBLIC が実行できない'
);
select ok(
  has_function_privilege('service_role', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE'),
  '権限表: submit_contact_message は service_role だけが実行できる'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_contact_message'
      and p.oid <> 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)'::regprocedure
  ),
  '旧署名の submit_contact_message(text,text,text,uuid) は残っていない'
);
select ok(
  not has_function_privilege('anon', 'public.purge_expired_contact_data()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.purge_expired_contact_data()', 'EXECUTE')
  and has_function_privilege('service_role', 'public.purge_expired_contact_data()', 'EXECUTE'),
  '権限表: purge_expired_contact_data は service_role だけが実行できる'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
   where p.oid = 'public.purge_expired_contact_data()'::regprocedure),
  'purge_expired_contact_data は security definer で search_path を固定している'
);

-- =========================================================
-- 匿名・ログイン利用者からの直接実行は拒否される
-- =========================================================
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select public.submit_contact_message('other', '直接', null, null, repeat('0', 64)) $$,
  '42501', null,
  '匿名: submit_contact_message を直接実行できない'
);
reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"44440000-0000-4000-8000-000000000010","role":"authenticated"}';
select throws_ok(
  $$ select public.submit_contact_message('other', '直接', null, null, repeat('0', 64), '44440000-0000-4000-8000-000000000010') $$,
  '42501', null,
  'ログイン利用者: submit_contact_message を直接実行できない'
);
select throws_ok(
  $$ select public.purge_expired_contact_data() $$,
  '42501', null,
  'ログイン利用者: purge_expired_contact_data を実行できない'
);
reset role;

-- =========================================================
-- 送信元ごとの回数制限（1時間に5件）
-- =========================================================
set local role service_role;

select is(
  (select count(*)::int from (
    select public.submit_contact_message('other', '回数' || g, null, null, repeat('a', 64)) as id
    from generate_series(1, 5) g
  ) s where s.id is not null),
  5,
  '同じ送信元から1時間に5件目までは受け付ける'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '回数6', null, null, repeat('a', 64)) $$,
  'P0001', 'しばらく時間をおいてから送ってください。',
  '同じ送信元の1時間に6件目は拒否する'
);
select isnt(
  public.submit_contact_message('other', '回数6', null, null, repeat('b', 64)),
  null::uuid,
  '別の送信元なら受け付ける'
);

-- =========================================================
-- 送信元ごとの1日の上限（20件）: 2時間前の記録を19件置いておく
-- =========================================================
reset role;
insert into contact_rate (source_hash, created_at)
select repeat('c', 64), now() - interval '2 hours' from generate_series(1, 19);
set local role service_role;

select isnt(
  public.submit_contact_message('other', '一日20件目', null, null, repeat('c', 64)),
  null::uuid,
  '同じ送信元の1日に20件目までは受け付ける'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '一日21件目', null, null, repeat('c', 64)) $$,
  'P0001', 'しばらく時間をおいてから送ってください。',
  '同じ送信元の1日に21件目は拒否する（1時間の上限には達していなくても）'
);

-- =========================================================
-- 全体の1日の上限（500件）
-- =========================================================
reset role;
insert into contact_rate (source_hash, created_at)
select md5('global' || g) || md5('filler' || g), now() - interval '3 hours'
from generate_series(1, 500 - (select count(*)::int from contact_rate where created_at > now() - interval '1 day')) g;
set local role service_role;

select throws_ok(
  $$ select public.submit_contact_message('other', '全体の上限', null, null, repeat('d', 64)) $$,
  'P0001', 'しばらく時間をおいてから送ってください。',
  '全体で1日に500件に達したら、初めての送信元でも拒否する'
);

reset role;
delete from contact_rate where created_at = now() - interval '3 hours';
set local role service_role;

select isnt(
  public.submit_contact_message('other', '全体の上限の後', null, null, repeat('d', 64)),
  null::uuid,
  '全体の件数が上限を下回れば受け付ける'
);

-- =========================================================
-- 容量の上限（contact_messages が10,000件に達したら受け付けない）
-- =========================================================
reset role;
insert into contact_messages (category, message)
select 'other', '容量' || g
from generate_series(1, 10000 - (select count(*)::int from contact_messages)) g;
set local role service_role;

select throws_ok(
  $$ select public.submit_contact_message('other', '容量の上限', null, null, repeat('e', 64)) $$,
  'P0001', 'しばらく時間をおいてから送ってください。',
  '問い合わせが10,000件に達したら新規を受け付けない'
);

reset role;
delete from contact_messages where message like '容量%' and message <> '容量の上限';
set local role service_role;

select isnt(
  public.submit_contact_message('other', '容量の上限', null, null, repeat('e', 64)),
  null::uuid,
  '整理されて10,000件を下回れば受け付ける'
);

-- =========================================================
-- 重複排除の鍵（category + message + spot_id + reply_to + requester_id + source_hash、直近1分）
-- =========================================================
select isnt(
  public.submit_contact_message('removal', '同じ文面', null, null, repeat('f', 64)),
  null::uuid,
  '重複排除: 最初の1件は保存する'
);
select is(
  public.submit_contact_message('removal', '同じ文面', null, null, repeat('f', 64)),
  null::uuid,
  '重複排除: 鍵がすべて同じなら保存せず null'
);
select isnt(
  public.submit_contact_message('removal', '同じ文面', null, '55550000-0000-4000-8000-000000000010', repeat('f', 64)),
  null::uuid,
  '重複排除: spot_id が違えば別件として保存する'
);
select isnt(
  public.submit_contact_message('removal', '同じ文面', 'shop@example.com', null, repeat('f', 64)),
  null::uuid,
  '重複排除: reply_to が違えば別件として保存する'
);
select isnt(
  public.submit_contact_message('removal', '同じ文面', null, null, repeat('f', 64), '44440000-0000-4000-8000-000000000010'),
  null::uuid,
  '重複排除: requester_id が違えば別件として保存する'
);
select isnt(
  public.submit_contact_message('removal', '同じ文面', null, null, repeat('9', 64)),
  null::uuid,
  '重複排除: 送信元が違えば別件として保存する'
);
-- contact_rate は service_role にも表の権限を与えていない（関数だけが触る）ので、postgres で数える。
reset role;
select is(
  (select count(*)::int from contact_rate where source_hash = repeat('f', 64)),
  4,
  '重複として捨てた送信は回数に数えない'
);
set local role service_role;

-- =========================================================
-- 個人情報の請求（privacy）は requester_id か reply_to のどちらかが必須
--   （0013 で「requester_id 必須」から変更。詳しくは tests/0013_contact_privacy_requests.sql）
-- =========================================================
select throws_ok(
  $$ select public.submit_contact_message('privacy', '登録した情報を消してください', null, null, repeat('1', 64)) $$,
  '22023', 'ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。',
  'privacy は requester_id も reply_to も無ければ拒否する'
);
select isnt(
  public.submit_contact_message('privacy', '登録した情報を消してください', null, null, repeat('1', 64), '44440000-0000-4000-8000-000000000010'),
  null::uuid,
  'privacy は requester_id があれば受け付ける'
);

-- =========================================================
-- 返信先メールアドレスの検査
-- =========================================================
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール1', 'a@@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: @ が2つあれば拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール2', 'a@b@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: 離れた位置に @ が2つあっても拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール3', 'a@example', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: ドメインに . が無ければ拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール4', 'a b@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: 途中に空白があれば拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール5', 'a@exa' || chr(10) || 'mple.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: 途中に改行があれば拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール6', 'a' || chr(1) || '@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: 制御文字があれば拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール7', 'a' || chr(12288) || 'b@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: 途中に全角空白があれば拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール8', '@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: ローカル部が空なら拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール9', 'a@', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: ドメイン部が空なら拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', 'メール10', repeat('a', 309) || '@example.com', null, repeat('2', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'メール: 321字なら拒否する'
);
select isnt(
  public.submit_contact_message('other', 'メール11', ' ' || repeat('a', 308) || '@example.com ', null, repeat('2', 64)),
  null::uuid,
  'メール: 前後の空白を除いて320字ちょうどなら受け付ける'
);

-- =========================================================
-- 送信元・User-Agent
-- =========================================================
select throws_ok(
  $$ select public.submit_contact_message('other', '送信元なし', null, null, null) $$,
  '22023', '送信元を確認できませんでした',
  '送信元のハッシュが無ければ拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('other', '送信元が生のIP', null, null, '203.0.113.1') $$,
  '22023', '送信元を確認できませんでした',
  '送信元がハッシュ（16進64文字）の形でなければ拒否する（IP をそのまま保存しない）'
);
select isnt(
  public.submit_contact_message('other', 'UAの長さ', null, null, repeat('3', 64), null, repeat('u', 300)),
  null::uuid,
  'User-Agent を渡して保存する'
);

reset role;

select is(
  (select char_length(user_agent) from contact_messages where message = 'UAの長さ'),
  200,
  'User-Agent は200字で切って保存する'
);
select is(
  (select requester_id from contact_messages where category = 'privacy'),
  '44440000-0000-4000-8000-000000000010'::uuid,
  'privacy の送信者（requester_id）を保存する'
);

-- =========================================================
-- 保存期間（purge）の境界: 問い合わせは1年ちょうど、contact_rate は24時間ちょうどで削除
-- =========================================================
insert into contact_messages (category, message, created_at) values
  ('other', '保存期間: 1年ちょうど', now() - interval '1 year'),
  ('other', '保存期間: 1年の1秒前', now() - interval '1 year' + interval '1 second');
insert into contact_rate (source_hash, created_at) values
  (repeat('4', 64), now() - interval '24 hours'),
  (repeat('5', 64), now() - interval '24 hours' + interval '1 second');

set local role service_role;
select is(
  public.purge_expired_contact_data(),
  '{"deletedMessages": 1, "deletedRates": 1}'::jsonb,
  'purge: 期限ちょうどの問い合わせ1件と contact_rate 1件だけを削除する'
);
reset role;

select is(
  (select array_agg(message order by message) from contact_messages where message like '保存期間:%'),
  array['保存期間: 1年の1秒前'],
  'purge: 1年に1秒足りない問い合わせは残る'
);
select is(
  (select array_agg(source_hash) from contact_rate where source_hash in (repeat('4', 64), repeat('5', 64))),
  array[repeat('5', 64)],
  'purge: 24時間に1秒足りない contact_rate は残る'
);

select * from finish();
rollback;
