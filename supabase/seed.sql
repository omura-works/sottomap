-- そっとマップ シードデータ
-- Spec: docs/SPEC.md §7（実データ方針）
--
-- 実データ方針:
--   - 街8件・実在店82件（最初の6件＋2026-10-06 に足した76件。11.）の「店名・住所・エリア・カテゴリ」は公開情報（各店の公式サイト /
--     グルメサイト掲載情報）にある事実のみを記載している。座標は住所から見た
--     おおまかな地区中心の近似値であり、正確なジオコーディング結果ではない（デモ用途）。
--   - 一方で「確認人数・承認・確認履歴・静けさステータス・灯りポイント」は
--     このアプリのゲームメカニクス上の状態であり、実店舗の事実の主張ではない。
--     ただし §7 の指示どおり、これらが UI 上の architecture-demo（架空）データである旨を
--     アプリ側（フッター/About）に明記すること。ここでは「架空」として扱ってよい
--     デモ用の確認履歴・承認・ユーザーを作成する。
--   - デモユーザーは実在の人物ではない、シード専用の仮名アカウント。
--
-- auth.users への直接 INSERT について:
--   Supabase Auth（GoTrue）管理下の auth.users に対し、ローカル開発の種データとして
--   直接 INSERT する（サインアップ経由ではない）。これは Supabase コミュニティで
--   広く使われるローカルシード手法だが、本番の認証結線は Task6 が Supabase Auth
--   経由の正規サインアップで行う。psql の無い環境ではこのファイルの構文レビューのみ
--   行っており、実行検証はできていない旨を報告に明記する。

-- =========================================================
-- 1〜3. cities（街8件）・tags・badges
--   本番公開前指示書 R13-B §2（final-review-R13 重要4）で
--   supabase/migrations/0008_reference_data.sql に移した（本番必須の参照データのため）。
--   db reset は 0008 が先に適用されるので、このシードでは架空データ（4以降）だけを追加する。
--   IDはそちらと同じ固定値のまま。
-- =========================================================

-- =========================================================
-- 4. auth.users + public.users（架空デモアカウント10件）
-- =========================================================
-- confirmation_token などのトークン列は、Supabase Auth（GoTrue）が NULL を読めない（「Database error finding user」になる）ため、
-- 空文字で入れる。これでローカルでもシードの利用者でメールログインできる（npm run test:e2e:realdb が使う）。
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('b0000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-k@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-m@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-t@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-sapporo-e1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-sapporo-e2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-s@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-h@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-r@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000009', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-otaru-e1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-otaru-e2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
on conflict (id) do nothing;

-- エリア・居住年数（users.area_name・resident_years）は集めない・表示しない（SPEC §9.18-2、R21 軽微3）ので入れない。
insert into users (id, display_name, home_city_id, avatar_url, lantern_points, created_at) values
  ('b0000000-0000-4000-8000-000000000001', 'Kさん', (select id from cities where slug = 'sapporo'), null, 65, now() - interval '220 days'),
  ('b0000000-0000-4000-8000-000000000002', 'Mさん', (select id from cities where slug = 'sapporo'), null, 40, now() - interval '300 days'),
  ('b0000000-0000-4000-8000-000000000003', 'Tさん', (select id from cities where slug = 'sapporo'), null, 25, now() - interval '180 days'),
  ('b0000000-0000-4000-8000-000000000004', 'Aさん', (select id from cities where slug = 'sapporo'), null, 30, now() - interval '400 days'),
  ('b0000000-0000-4000-8000-000000000005', 'Nさん', (select id from cities where slug = 'sapporo'), null, 20, now() - interval '400 days'),
  ('b0000000-0000-4000-8000-000000000006', 'Sさん', (select id from cities where slug = 'otaru'), null, 55, now() - interval '400 days'),
  ('b0000000-0000-4000-8000-000000000007', 'Hさん', (select id from cities where slug = 'otaru'), null, 70, now() - interval '500 days'),
  ('b0000000-0000-4000-8000-000000000008', 'Rさん', (select id from cities where slug = 'otaru'), null, 45, now() - interval '600 days'),
  ('b0000000-0000-4000-8000-000000000009', 'Fさん', (select id from cities where slug = 'otaru'), null, 15, now() - interval '600 days'),
  ('b0000000-0000-4000-8000-00000000000a', 'Yさん', (select id from cities where slug = 'otaru'), null, 10, now() - interval '600 days')
on conflict (id) do nothing;

-- =========================================================
-- 5. spots（実在6店）
--   店名・住所・エリア・カテゴリ・引用文は公開情報 / docs/design-reference の
--   採用コピーに基づく事実。座標は住所から見た近似値。
--   ステータス・静けさ・確認履歴・承認は §7 の方針どおり架空のデモデータ。
-- =========================================================

-- 5-1. シハチ鮮魚店 北24条店（札幌・北24条・海鮮丼）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000001',
  (select id from cities where slug = 'sapporo'),
  'シハチ鮮魚店 北24条店',
  '北海道札幌市北区北24条西2丁目1-13 ベアーズ24',
  '北24条',
  '海鮮丼',
  ST_SetSRID(ST_MakePoint(141.3486, 43.0847), 4326)::geography,
  'published', 'quiet',
  -- Spec §9.8 D1「店3件の説明」1件目（一字一句）。
  '魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。',
  'monthly',
  'b0000000-0000-4000-8000-000000000001',
  null,
  now() - interval '213 days',
  now() + interval '87 days',
  now() - interval '3 days',
  now() - interval '220 days'
) on conflict (id) do nothing;

-- 5-2. 札幌ザンギ本舗（札幌・すすきの・ザンギ）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000002',
  (select id from cities where slug = 'sapporo'),
  '札幌ザンギ本舗',
  '北海道札幌市中央区南六条西4丁目 G4ビル1F',
  'すすきの',
  'ザンギ',
  ST_SetSRID(ST_MakePoint(141.3540, 43.0552), 4326)::geography,
  'published', 'quiet',
  -- Spec §9.8 D1「店3件の説明」2件目（一字一句）。
  'ザンギは唐揚げではない、と地元は言う。持ち帰りもできる。',
  'weekly',
  'b0000000-0000-4000-8000-000000000002',
  null,
  now() - interval '293 days',
  now() + interval '85 days',
  now() - interval '5 days',
  now() - interval '300 days'
) on conflict (id) do nothing;

-- 5-3. 札幌らーめん輝風 すすきの店（札幌・すすきの・味噌ラーメン）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000003',
  (select id from cities where slug = 'sapporo'),
  '札幌らーめん輝風 すすきの店',
  '北海道札幌市中央区南5条西3-1 大松ビル1F',
  'すすきの',
  '味噌ラーメン',
  ST_SetSRID(ST_MakePoint(141.3534, 43.0562), 4326)::geography,
  'published', 'crowding',
  -- Spec §9.8 D1「店3件の説明」3件目（一字一句）。
  '味噌。夜のすすきので、地元が最後に寄る一杯。',
  'monthly',
  'b0000000-0000-4000-8000-000000000003',
  null,
  now() - interval '175 days',
  now() + interval '84 days',
  now() - interval '6 days',
  now() - interval '180 days'
) on conflict (id) do nothing;

-- 5-4. 聖徳太子 飛鳥店（小樽・花園・日替わり定食）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000004',
  (select id from cities where slug = 'otaru'),
  '聖徳太子 飛鳥店',
  '北海道小樽市花園1-12-21',
  '花園',
  '日替わり定食',
  ST_SetSRID(ST_MakePoint(140.9989, 43.1937), 4326)::geography,
  'published', 'quiet',
  '小樽駅から徒歩10分。観光通りから少し外れているぶん、地元の昼どきが静か。',
  'weekly',
  'b0000000-0000-4000-8000-000000000006',
  null,
  now() - interval '395 days',
  now() + interval '50 days',
  now() - interval '40 days',
  now() - interval '400 days'
) on conflict (id) do nothing;

-- 5-5. 南樽市場（小樽・新富町・市場）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000005',
  (select id from cities where slug = 'otaru'),
  '南樽市場',
  '北海道小樽市新富町12番1号',
  '新富町',
  '市場',
  ST_SetSRID(ST_MakePoint(140.9925, 43.1875), 4326)::geography,
  'published', 'quiet',
  '観光客は三角市場へ行く。地元は南樽で買う。',
  'weekly',
  'b0000000-0000-4000-8000-000000000007',
  null,
  now() - interval '495 days',
  now() + interval '75 days',
  now() - interval '15 days',
  now() - interval '500 days'
) on conflict (id) do nothing;

-- 5-6. 鱗友朝市（小樽・色内・朝市）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000006',
  (select id from cities where slug = 'otaru'),
  '鱗友朝市',
  '北海道小樽市色内3-10-15',
  '色内',
  '朝市',
  ST_SetSRID(ST_MakePoint(140.9944, 43.2004), 4326)::geography,
  'published', 'touristy',
  '朝のうちに行くのが地元の流儀。昼が近づくほど観光バスが増える。',
  'monthly',
  'b0000000-0000-4000-8000-000000000008',
  null,
  now() - interval '590 days',
  now() - interval '5 days',
  now() - interval '95 days',
  now() - interval '600 days'
) on conflict (id) do nothing;

-- Spec §9.8 D1 ホバーカード専用文言（一字一句）。
update spots
set hover_description = '魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。'
where id = 'd0000000-0000-4000-8000-000000000001';

-- =========================================================
-- 6. spot_tags
--   シハチ鮮魚店は Spec §9.8 S4 のタグ3種（魚屋直営／昼が本番／市内2店舗）を持つ。
-- =========================================================
insert into spot_tags (spot_id, tag_id) values
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001'), -- シハチ: 魚屋直営
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000009'), -- シハチ: 昼が本番
  ('d0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-00000000000a'), -- シハチ: 市内2店舗
  ('d0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000002'), -- ザンギ: 持ち帰りもできる
  ('d0000000-0000-4000-8000-000000000003', 'e0000000-0000-4000-8000-000000000003'), -- 輝風: 夜が本番
  ('d0000000-0000-4000-8000-000000000005', 'e0000000-0000-4000-8000-000000000004'), -- 南樽市場: 地元が買いに行く市場
  ('d0000000-0000-4000-8000-000000000006', 'e0000000-0000-4000-8000-000000000005')  -- 鱗友朝市: 朝のうちに
on conflict do nothing;

-- =========================================================
-- 7. endorsements（架空：pending→published の同じ街2人承認）
-- =========================================================
insert into endorsements (spot_id, user_id, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', now() - interval '215 days'),
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', now() - interval '213 days'),

  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', now() - interval '295 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', now() - interval '293 days'),

  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', now() - interval '178 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000005', now() - interval '175 days'),

  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000009', now() - interval '398 days'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-00000000000a', now() - interval '395 days'),

  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000009', now() - interval '498 days'),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000006', now() - interval '495 days'),

  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-00000000000a', now() - interval '593 days'),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000007', now() - interval '590 days')
on conflict do nothing;

-- =========================================================
-- 8. verifications（90日ごとの確認。Spec §9.2「最後に受理された確認の回答」で
--    現在の静けさを決める。§3 RLS のとおり本来はスポットの author_id のみが
--    回答できるため、original の各行は author_id と一致させている。
--
--    【架空データの注記】シハチ鮮魚店/ザンギ本舗/輝風の3店には、Spec §9.8/§1 が
--    指定する「地元3人/5人/4人が確認」の文言を満たすため、投稿者以外の架空の
--    確認者を直近バッチに追加している。本番のRLS
--    （verifications_insert_spot_author_only）では投稿者以外はこのテーブルへ
--    挿入できないため、この追加行はシード専用の架空データである
--    （§7「確認人数…はUI上の架空データ」）。
--
--    鱗友朝市は quiet→quiet→touristy→touristy という履歴。resolveQuietness は
--    多数決をしないため、単純に最新（＝時系列で一番新しい touristy）を採用する例。
--
--    備考（note）は集めない（R21 重要1・0014）ので入れない。
--    確認は必ず依頼に紐づく（0006: verifications.verification_request_id は NOT NULL）。
--    各行に、回答者宛ての回答済み（answered）依頼を1件ずつ作ってから紐づける
--    （依頼の due_at = 回答時刻、created_at = 回答時刻の90日前）。現在の open 依頼は 10. で作る。
-- =========================================================
with src (spot_id, user_id, answer, created_at) as (values
  -- シハチ鮮魚店（quiet が継続。直近バッチは投稿者Kさん+架空2名=計3人）
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'quiet', now() - interval '120 days'),
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'quiet', now() - interval '30 days'),
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005', 'quiet', now() - interval '3 days'),

  -- 札幌ザンギ本舗（quiet が継続。直近バッチは投稿者Mさん+架空4名=計5人）
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '200 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '110 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'quiet', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004', 'quiet', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000005', 'quiet', now() - interval '5 days'),

  -- 札幌らーめん輝風（直近で crowding に転じた。直近バッチは投稿者Tさん+架空3名=計4人）
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '90 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'crowding', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'crowding', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'crowding', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'crowding', now() - interval '6 days'),

  -- 聖徳太子 飛鳥店（quiet が継続）
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '300 days'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '210 days'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '40 days'),

  -- 南樽市場（quiet が継続）
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '400 days'),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '300 days'),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '200 days'),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '15 days'),

  -- 鱗友朝市（quiet 2件・touristy 2件の同数タイ。新しい方の touristy を採用する例）
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '500 days'),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '350 days'),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000008', 'touristy', now() - interval '100 days'),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000008', 'touristy', now() - interval '95 days')
),
numbered as materialized (
  select
    src.spot_id::uuid as spot_id,
    src.user_id::uuid as user_id,
    src.answer::text as answer,
    src.created_at::timestamptz as created_at,
    gen_random_uuid() as request_id,
    gen_random_uuid() as verification_id
  from src
),
inserted_requests as (
  insert into verification_requests (id, spot_id, user_id, due_at, status, created_at)
  select request_id, spot_id, user_id, created_at, 'answered', created_at - interval '90 days'
  from numbered
  returning id
)
insert into verifications (id, spot_id, user_id, answer, created_at, verification_request_id)
select verification_id, spot_id, user_id, answer, created_at, request_id
from numbered
where exists (select 1 from inserted_requests r where r.id = numbered.request_id);

-- 回答済み依頼から回答への逆向きの紐づけ
update verification_requests vr
set answered_verification_id = v.id
from verifications v
where v.verification_request_id = vr.id
  and vr.status = 'answered'
  and vr.answered_verification_id is null;

-- =========================================================
-- 9. bookmarks（Spec §9.8 S8: シハチ鮮魚店／聖徳太子 飛鳥店／南樽市場／鱗友朝市の4件。
--    利用者は Task5 が採用した DEMO_USER_ID（Aさん = b...0004）に合わせてある。）
-- =========================================================
insert into bookmarks (user_id, spot_id, planned_at, meta, created_at) values
  ('b0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000001', ((now() at time zone 'Asia/Tokyo')::date + interval '1 day 12 hours 30 minutes') at time zone 'Asia/Tokyo', null, now() - interval '2 days'),
  ('b0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000004', null, '小樽駅から徒歩10分 / 日替わり定食', now() - interval '5 days'),
  ('b0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000005', null, '小樽 / 地元が買いに行く市場', now() - interval '8 days'),
  ('b0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-000000000006', null, '小樽 / 朝のうちに', now() - interval '12 days')
on conflict (user_id, spot_id) do update set
  planned_at = excluded.planned_at,
  meta = excluded.meta;

-- =========================================================
-- 10. verification_requests（Spec §9.1）
--    各 published スポットに、公開時点で作られたはずの open な確認依頼を1件ずつ用意する
--    （due_at = spots.next_verification_at と揃える）。鱗友朝市は due_at が既に過去だが、
--    まだ90日は超過していないため missed ではなく open のままにしている。
-- =========================================================
insert into verification_requests (spot_id, user_id, due_at, status, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', now() + interval '87 days', 'open', now() - interval '213 days'),
  ('d0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', now() + interval '85 days', 'open', now() - interval '293 days'),
  ('d0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', now() + interval '84 days', 'open', now() - interval '175 days'),
  ('d0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006', now() + interval '50 days', 'open', now() - interval '395 days'),
  ('d0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000007', now() + interval '75 days', 'open', now() - interval '495 days'),
  ('d0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000008', now() - interval '5 days',  'open', now() - interval '590 days')
on conflict do nothing;

-- =========================================================
-- 11. 実在の店（追加分 76 軒。2026-10-06 に公開情報で営業を確かめた店）
--   src/lib/db/fixtures-real-shops.ts と同じ内容（fixtures.test.ts が照らし合わせる）。
--   店名・住所・エリア・種類・座標（国土地理院の住所検索）・一言は公開情報にもとづく。
--   静けさ・確認の履歴・承認・投稿者は §7 の方針どおり架空のデモデータ。
--   札幌・小樽以外の街に住む架空のデモ利用者（各街3人）もここで足す。
-- =========================================================
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('b0000000-0000-4000-8000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-hakodate-1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-hakodate-2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000000d', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-hakodate-3@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-asahikawa-1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000000f', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-asahikawa-2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000010', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-asahikawa-3@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000011', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-furano-1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000012', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-furano-2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-furano-3@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000014', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-kushiro-1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000015', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-kushiro-2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000016', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-kushiro-3@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000017', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-obihiro-1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000018', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-obihiro-2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-000000000019', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-obihiro-3@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000001a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-wakkanai-1@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000001b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-wakkanai-2@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', ''),
  ('b0000000-0000-4000-8000-00000000001c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'demo-wakkanai-3@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, '', '', '', '')
on conflict (id) do nothing;

insert into users (id, display_name, home_city_id, avatar_url, lantern_points, created_at) values
  ('b0000000-0000-4000-8000-00000000000b', 'Iさん', (select id from cities where slug = 'hakodate'), null, 49, now() - interval '700 days'),
  ('b0000000-0000-4000-8000-00000000000c', 'Uさん', (select id from cities where slug = 'hakodate'), null, 56, now() - interval '680 days'),
  ('b0000000-0000-4000-8000-00000000000d', 'Eさん', (select id from cities where slug = 'hakodate'), null, 63, now() - interval '660 days'),
  ('b0000000-0000-4000-8000-00000000000e', 'Oさん', (select id from cities where slug = 'asahikawa'), null, 20, now() - interval '700 days'),
  ('b0000000-0000-4000-8000-00000000000f', 'Wさん', (select id from cities where slug = 'asahikawa'), null, 27, now() - interval '680 days'),
  ('b0000000-0000-4000-8000-000000000010', 'Gさん', (select id from cities where slug = 'asahikawa'), null, 34, now() - interval '660 days'),
  ('b0000000-0000-4000-8000-000000000011', 'Jさん', (select id from cities where slug = 'furano'), null, 41, now() - interval '700 days'),
  ('b0000000-0000-4000-8000-000000000012', 'Lさん', (select id from cities where slug = 'furano'), null, 48, now() - interval '680 days'),
  ('b0000000-0000-4000-8000-000000000013', 'Pさん', (select id from cities where slug = 'furano'), null, 55, now() - interval '660 days'),
  ('b0000000-0000-4000-8000-000000000014', 'Dさん', (select id from cities where slug = 'kushiro'), null, 62, now() - interval '700 days'),
  ('b0000000-0000-4000-8000-000000000015', 'Bさん', (select id from cities where slug = 'kushiro'), null, 19, now() - interval '680 days'),
  ('b0000000-0000-4000-8000-000000000016', 'Cさん', (select id from cities where slug = 'kushiro'), null, 26, now() - interval '660 days'),
  ('b0000000-0000-4000-8000-000000000017', 'Hさん', (select id from cities where slug = 'obihiro'), null, 33, now() - interval '700 days'),
  ('b0000000-0000-4000-8000-000000000018', 'Sさん', (select id from cities where slug = 'obihiro'), null, 40, now() - interval '680 days'),
  ('b0000000-0000-4000-8000-000000000019', 'Tさん', (select id from cities where slug = 'obihiro'), null, 47, now() - interval '660 days'),
  ('b0000000-0000-4000-8000-00000000001a', 'Kさん', (select id from cities where slug = 'wakkanai'), null, 54, now() - interval '700 days'),
  ('b0000000-0000-4000-8000-00000000001b', 'Nさん', (select id from cities where slug = 'wakkanai'), null, 61, now() - interval '680 days'),
  ('b0000000-0000-4000-8000-00000000001c', 'Rさん', (select id from cities where slug = 'wakkanai'), null, 18, now() - interval '660 days')
on conflict (id) do nothing;

-- 札幌・西18丁目・食堂
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000000a',
  (select id from cities where slug = 'sapporo'),
  'ゆりや食堂',
  '北海道札幌市中央区南1条西19丁目1-254 ドレイジャータワービル1F',
  '西18丁目',
  '食堂',
  ST_SetSRID(ST_MakePoint(141.328232, 43.056152), 4326)::geography,
  'published', 'quiet',
  '昭和21年創業の食堂だよ。ラーメンも目玉ライスもあるの',
  'weekly',
  'b0000000-0000-4000-8000-000000000002',
  null,
  now() - interval '168 days',
  now() + interval '35 days',
  now() - interval '55 days',
  now() - interval '172 days'
) on conflict (id) do nothing;

-- 札幌・北18条・本屋
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000000b',
  (select id from cities where slug = 'sapporo'),
  'Seesaw Books（シーソーブックス）',
  '北海道札幌市北区北18条西4丁目1-8',
  '北18条',
  '本屋',
  ST_SetSRID(ST_MakePoint(141.345703, 43.081612), 4326)::geography,
  'published', 'quiet',
  '新刊と古本とZINEが並ぶ小さな本屋さん。水曜はお休みだよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000005',
  null,
  now() - interval '58 days',
  now() + interval '68 days',
  now() - interval '22 days',
  now() - interval '63 days'
) on conflict (id) do nothing;

-- 札幌・創成イースト・大衆酒場
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000000c',
  (select id from cities where slug = 'sapporo'),
  '第三モッキリセンター',
  '北海道札幌市中央区南1条東2丁目2',
  '創成イースト',
  '大衆酒場',
  ST_SetSRID(ST_MakePoint(141.358704, 43.060478), 4326)::geography,
  'published', 'quiet',
  '昼の1時から開いてる大衆酒場。昭和の空気がそのまま残ってるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000002',
  null,
  now() - interval '168 days',
  now() + interval '68 days',
  now() - interval '22 days',
  now() - interval '174 days'
) on conflict (id) do nothing;

-- 札幌・山鼻・銭湯
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000000d',
  (select id from cities where slug = 'sapporo'),
  '鶴の湯',
  '北海道札幌市中央区南19条西7丁目3-1',
  '山鼻',
  '銭湯',
  ST_SetSRID(ST_MakePoint(141.350067, 43.033875), 4326)::geography,
  'published', 'quiet',
  '番台の上に大きな時計がある、昭和10年創業の銭湯だよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000003',
  null,
  now() - interval '168 days',
  now() + interval '64 days',
  now() - interval '26 days',
  now() - interval '171 days'
) on conflict (id) do nothing;

-- 札幌・北24条・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000000e',
  (select id from cities where slug = 'sapporo'),
  'フレッシュベーカリー ノア 本店',
  '北海道札幌市北区北25条西5丁目1-21',
  '北24条',
  'パン',
  ST_SetSRID(ST_MakePoint(141.342377, 43.091938), 4326)::geography,
  'published', 'quiet',
  '朝7時半から開くパン屋さん。小豆入りの豆パンが昔からの定番だよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000005',
  null,
  now() - interval '168 days',
  now() + interval '50 days',
  now() - interval '40 days',
  now() - interval '173 days'
) on conflict (id) do nothing;

-- 札幌・円山・甘味
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000000f',
  (select id from cities where slug = 'sapporo'),
  'あんみつ さきの',
  '北海道札幌市中央区北1条西26丁目1-15 円山鳥居前ビル1F',
  '円山',
  '甘味',
  ST_SetSRID(ST_MakePoint(141.317978, 43.057991), 4326)::geography,
  'published', 'quiet',
  '円山の鳥居の近く。あんこも寒天も手作りのあんみつ専門店だよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000003',
  null,
  now() - interval '105 days',
  now() + interval '71 days',
  now() - interval '19 days',
  now() - interval '111 days'
) on conflict (id) do nothing;

-- 札幌・大通・喫茶・サンドイッチ
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000010',
  (select id from cities where slug = 'sapporo'),
  '珈琲とサンドイッチの店 さえら',
  '北海道札幌市中央区大通西2丁目5-1 都心ビルB3F',
  '大通',
  '喫茶・サンドイッチ',
  ST_SetSRID(ST_MakePoint(141.35463, 43.060181), 4326)::geography,
  'published', 'crowding',
  '都心ビルの地下3階。開店してすぐ席が埋まるサンドイッチの店だよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000003',
  null,
  now() - interval '149 days',
  now() + interval '20 days',
  now() - interval '70 days',
  now() - interval '152 days'
) on conflict (id) do nothing;

-- 札幌・創成川イースト・市場
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000011',
  (select id from cities where slug = 'sapporo'),
  '二条市場',
  '北海道札幌市中央区南3条東1丁目〜2丁目',
  '創成川イースト',
  '市場',
  ST_SetSRID(ST_MakePoint(141.358307, 43.058006), 4326)::geography,
  'published', 'touristy',
  '鮮魚店と食堂が並ぶ市場。朝ごはんを食べに来る観光の人も多いよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000002',
  null,
  now() - interval '168 days',
  now() + interval '55 days',
  now() - interval '35 days',
  now() - interval '172 days'
) on conflict (id) do nothing;

-- 小樽・若松・餅・大福
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000012',
  (select id from cities where slug = 'otaru'),
  '雷除志ん古',
  '北海道小樽市若松1丁目5-13',
  '若松',
  '餅・大福',
  ST_SetSRID(ST_MakePoint(141.008438, 43.185104), 4326)::geography,
  'published', 'quiet',
  '朝5時半から開くお餅屋さん。大福は売り切れたらおしまいだよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000007',
  null,
  now() - interval '183 days',
  now() + interval '87 days',
  now() - interval '3 days',
  now() - interval '190 days'
) on conflict (id) do nothing;

-- 小樽・都通り・喫茶
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000013',
  (select id from cities where slug = 'otaru'),
  '純喫茶 光',
  '北海道小樽市稲穂2丁目11-8',
  '都通り',
  '喫茶',
  ST_SetSRID(ST_MakePoint(140.99675, 43.197552), 4326)::geography,
  'published', 'quiet',
  '昭和8年創業の喫茶店。コーヒーにカステラが付いてくるよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000009',
  null,
  now() - interval '218 days',
  now() + interval '86 days',
  now() - interval '4 days',
  now() - interval '226 days'
) on conflict (id) do nothing;

-- 小樽・奥沢・銭湯
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000014',
  (select id from cities where slug = 'otaru'),
  '奥沢温泉 中央湯',
  '北海道小樽市奥沢3丁目27-22',
  '奥沢',
  '銭湯',
  ST_SetSRID(ST_MakePoint(140.999039, 43.174046), 4326)::geography,
  'published', 'quiet',
  '番台が残る温泉銭湯。脱衣所の本棚の本を借りて読めるんだって',
  'weekly',
  'b0000000-0000-4000-8000-000000000008',
  null,
  now() - interval '388 days',
  now() + interval '84 days',
  now() - interval '6 days',
  now() - interval '395 days'
) on conflict (id) do nothing;

-- 小樽・稲穂・市場
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000015',
  (select id from cities where slug = 'otaru'),
  '小樽中央市場',
  '北海道小樽市稲穂3丁目11-2',
  '稲穂',
  '市場',
  ST_SetSRID(ST_MakePoint(140.994324, 43.199532), 4326)::geography,
  'published', 'quiet',
  '駅から3分、昭和から続く市場。いまは地元のお客さんが中心だよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000008',
  null,
  now() - interval '388 days',
  now() + interval '29 days',
  now() - interval '61 days',
  now() - interval '394 days'
) on conflict (id) do nothing;

-- 小樽・都通り・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000016',
  (select id from cities where slug = 'otaru'),
  'モンピエール',
  '北海道小樽市稲穂2丁目15-9',
  '都通り',
  'パン',
  ST_SetSRID(ST_MakePoint(140.997559, 43.196125), 4326)::geography,
  'published', 'quiet',
  '都通りのパン屋さん。2階に少しだけイートインの席があるよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000a',
  null,
  now() - interval '96 days',
  now() + interval '53 days',
  now() - interval '37 days',
  now() - interval '101 days'
) on conflict (id) do nothing;

-- 小樽・花園・居酒屋・炉端焼き
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000017',
  (select id from cities where slug = 'otaru'),
  '炉ばた屋 鶴吉 本店',
  '北海道小樽市花園1丁目8-23',
  '花園',
  '居酒屋・炉端焼き',
  ST_SetSRID(ST_MakePoint(140.998566, 43.192585), 4326)::geography,
  'published', 'quiet',
  '花園の炉ばた屋さん。目の前の炉端で魚介を焼いてくれるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000006',
  null,
  now() - interval '388 days',
  now() + interval '54 days',
  now() - interval '36 days',
  now() - interval '395 days'
) on conflict (id) do nothing;

-- 小樽・都通り・町中華（あんかけ焼そば）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000018',
  (select id from cities where slug = 'otaru'),
  '中華食堂 桂苑',
  '北海道小樽市稲穂2丁目16-14',
  '都通り',
  '町中華（あんかけ焼そば）',
  ST_SetSRID(ST_MakePoint(140.996506, 43.196075), 4326)::geography,
  'published', 'crowding',
  '昭和39年創業。注文の半分くらいがあんかけ焼そばなんだって',
  'monthly',
  'b0000000-0000-4000-8000-000000000009',
  null,
  now() - interval '276 days',
  now() + interval '68 days',
  now() - interval '22 days',
  now() - interval '282 days'
) on conflict (id) do nothing;

-- 小樽・稲穂・そば
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000019',
  (select id from cities where slug = 'otaru'),
  '小樽・蕎麦屋・籔半',
  '北海道小樽市稲穂2丁目19-14',
  '稲穂',
  'そば',
  ST_SetSRID(ST_MakePoint(140.995636, 43.196465), 4326)::geography,
  'published', 'crowding',
  '石造りの倉庫を生かしたそば屋さん。夜はそばが売り切れることも',
  'monthly',
  'b0000000-0000-4000-8000-000000000006',
  null,
  now() - interval '220 days',
  now() + interval '80 days',
  now() - interval '10 days',
  now() - interval '223 days'
) on conflict (id) do nothing;

-- 小樽・寿司屋通り・寿司
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000001a',
  (select id from cities where slug = 'otaru'),
  'おたる政寿司 本店',
  '北海道小樽市花園1丁目1-1',
  '寿司屋通り',
  '寿司',
  ST_SetSRID(ST_MakePoint(140.999603, 43.194111), 4326)::geography,
  'published', 'touristy',
  '寿司屋通りで80年以上続くお寿司屋さん。行くなら予約がおすすめだよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000006',
  null,
  now() - interval '388 days',
  now() + interval '69 days',
  now() - interval '21 days',
  now() - interval '393 days'
) on conflict (id) do nothing;

-- 函館・新川町・市場
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000001b',
  (select id from cities where slug = 'hakodate'),
  'はこだて自由市場',
  '北海道函館市新川町1-2',
  '新川町',
  '市場',
  ST_SetSRID(ST_MakePoint(140.734314, 41.773144), 4326)::geography,
  'published', 'quiet',
  '市民の買い物市場でね、8のつく日は全店で特売なんだよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000b',
  null,
  now() - interval '297 days',
  now() + interval '87 days',
  now() - interval '3 days',
  now() - interval '303 days'
) on conflict (id) do nothing;

-- 函館・中島町・市場・商店街
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000001c',
  (select id from cities where slug = 'hakodate'),
  '中島廉売',
  '北海道函館市中島町25-18',
  '中島町',
  '市場・商店街',
  ST_SetSRID(ST_MakePoint(140.74234, 41.781631), 4326)::geography,
  'published', 'quiet',
  '50軒くらい並ぶ市民の台所。鮮魚も青果もそろうよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000b',
  null,
  now() - interval '111 days',
  now() + interval '88 days',
  now() - interval '2 days',
  now() - interval '118 days'
) on conflict (id) do nothing;

-- 函館・豊川町（魚市場）・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000001d',
  (select id from cities where slug = 'hakodate'),
  '函館魚市場食堂 魚いち亭',
  '北海道函館市豊川町27-6 函館市水産物地方卸売市場2階',
  '豊川町（魚市場）',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(140.719269, 41.768383), 4326)::geography,
  'published', 'quiet',
  '魚市場の2階の食堂でね、朝6時半から開いてるんだよ',
  'monthly',
  'b0000000-0000-4000-8000-00000000000d',
  null,
  now() - interval '506 days',
  now() + interval '88 days',
  now() - interval '2 days',
  now() - interval '513 days'
) on conflict (id) do nothing;

-- 函館・大門・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000001e',
  (select id from cities where slug = 'hakodate'),
  '津軽屋食堂',
  '北海道函館市松風町7-6',
  '大門',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(140.730133, 41.772667), 4326)::geography,
  'published', 'quiet',
  'ショーケースのおかずを選んで、好きな定食にできるんだよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000d',
  null,
  now() - interval '434 days',
  now() + interval '33 days',
  now() - interval '57 days',
  now() - interval '438 days'
) on conflict (id) do nothing;

-- 函館・千歳町・新川町・喫茶
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000001f',
  (select id from cities where slug = 'hakodate'),
  '喫茶タイム',
  '北海道函館市千歳町8-12',
  '千歳町・新川町',
  '喫茶',
  ST_SetSRID(ST_MakePoint(140.736191, 41.773228), 4326)::geography,
  'published', 'quiet',
  'オリエント急行がモチーフの店内でね、自家製ハムが名物なの',
  'weekly',
  'b0000000-0000-4000-8000-00000000000c',
  null,
  now() - interval '77 days',
  now() + interval '14 days',
  now() - interval '76 days',
  now() - interval '80 days'
) on conflict (id) do nothing;

-- 函館・亀田本町・五稜郭駅・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000020',
  (select id from cities where slug = 'hakodate'),
  'キングベーク 本店',
  '北海道函館市亀田本町7-8',
  '亀田本町・五稜郭駅',
  'パン',
  ST_SetSRID(ST_MakePoint(140.739578, 41.802994), 4326)::geography,
  'published', 'quiet',
  '朝7時から開いてて、イートインでモーニングも食べられるよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000d',
  null,
  now() - interval '132 days',
  now() + interval '43 days',
  now() - interval '47 days',
  now() - interval '138 days'
) on conflict (id) do nothing;

-- 函館・栄町・甘味・餅
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000021',
  (select id from cities where slug = 'hakodate'),
  '栄餅本店',
  '北海道函館市栄町5-13',
  '栄町',
  '甘味・餅',
  ST_SetSRID(ST_MakePoint(140.725906, 41.764423), 4326)::geography,
  'published', 'quiet',
  '明治33年からのお餅屋さん。べこ餅も並んでるよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000d',
  null,
  now() - interval '510 days',
  now() + interval '21 days',
  now() - interval '69 days',
  now() - interval '514 days'
) on conflict (id) do nothing;

-- 函館・本町・五稜郭・居酒屋
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000022',
  (select id from cities where slug = 'hakodate'),
  'マルケン酒場 本町店',
  '北海道函館市本町4-22 YS本町ビル',
  '本町・五稜郭',
  '居酒屋',
  ST_SetSRID(ST_MakePoint(140.751022, 41.787502), 4326)::geography,
  'published', 'quiet',
  '牛もつの煮込みと串揚げが看板の、気軽な酒場だよ',
  'monthly',
  'b0000000-0000-4000-8000-00000000000b',
  null,
  now() - interval '135 days',
  now() + interval '7 days',
  now() - interval '83 days',
  now() - interval '143 days'
) on conflict (id) do nothing;

-- 函館・大門・ラーメン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000023',
  (select id from cities where slug = 'hakodate'),
  '滋養軒',
  '北海道函館市松風町7-12',
  '大門',
  'ラーメン',
  ST_SetSRID(ST_MakePoint(140.730835, 41.77314), 4326)::geography,
  'published', 'crowding',
  '2階で毎朝つくる自家製麺の、塩ラーメンなんだよ',
  'monthly',
  'b0000000-0000-4000-8000-00000000000d',
  null,
  now() - interval '75 days',
  now() + interval '73 days',
  now() - interval '17 days',
  now() - interval '79 days'
) on conflict (id) do nothing;

-- 函館・ベイエリア・末広町・ハンバーガー
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000024',
  (select id from cities where slug = 'hakodate'),
  'ラッキーピエロ ベイエリア本店',
  '北海道函館市末広町23-18',
  'ベイエリア・末広町',
  'ハンバーガー',
  ST_SetSRID(ST_MakePoint(140.715103, 41.765759), 4326)::geography,
  'published', 'touristy',
  '函館生まれのハンバーガー屋さんの、ベイエリアの本店だよ',
  'yearly',
  'b0000000-0000-4000-8000-00000000000b',
  null,
  now() - interval '465 days',
  now() + interval '26 days',
  now() - interval '64 days',
  now() - interval '468 days'
) on conflict (id) do nothing;

-- 旭川・3条通・中心部・喫茶
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000025',
  (select id from cities where slug = 'asahikawa'),
  '珈琲亭ちろる',
  '北海道旭川市3条通8丁目左7',
  '3条通・中心部',
  '喫茶',
  ST_SetSRID(ST_MakePoint(142.361115, 43.767555), 4326)::geography,
  'published', 'quiet',
  '小説『氷点』にも出てくる喫茶店。自家焙煎の珈琲だよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000e',
  null,
  now() - interval '277 days',
  now() + interval '89 days',
  now() - interval '1 days',
  now() - interval '285 days'
) on conflict (id) do nothing;

-- 旭川・錦町・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000026',
  (select id from cities where slug = 'asahikawa'),
  'ベーカリー寛',
  '北海道旭川市錦町20丁目2166-98',
  '錦町',
  'パン',
  ST_SetSRID(ST_MakePoint(142.330826, 43.793407), 4326)::geography,
  'published', 'quiet',
  '道産の小麦で焼くパン屋さん。売り切れたらおしまいだよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000010',
  null,
  now() - interval '475 days',
  now() + interval '89 days',
  now() - interval '1 days',
  now() - interval '479 days'
) on conflict (id) do nothing;

-- 旭川・東5条・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000027',
  (select id from cities where slug = 'asahikawa'),
  'お食事の店 すず',
  '北海道旭川市東5条2丁目3-8',
  '東5条',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(142.376633, 43.776966), 4326)::geography,
  'published', 'quiet',
  '昭和45年からの食堂でね、おかずを足して定食にできるよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000010',
  null,
  now() - interval '458 days',
  now() + interval '84 days',
  now() - interval '6 days',
  now() - interval '462 days'
) on conflict (id) do nothing;

-- 旭川・春光・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000028',
  (select id from cities where slug = 'asahikawa'),
  '金次郎食堂',
  '北海道旭川市春光7条9丁目5-25',
  '春光',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(142.367645, 43.811852), 4326)::geography,
  'published', 'quiet',
  'とんかつ定食もラーメンも手ごろでね、お昼だけの食堂なの',
  'weekly',
  'b0000000-0000-4000-8000-00000000000f',
  null,
  now() - interval '133 days',
  now() + interval '56 days',
  now() - interval '34 days',
  now() - interval '137 days'
) on conflict (id) do nothing;

-- 旭川・亀吉・甘味・餅
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000029',
  (select id from cities where slug = 'asahikawa'),
  '餅菓子専門 おぎ乃',
  '北海道旭川市亀吉2条1丁目4-16',
  '亀吉',
  '甘味・餅',
  ST_SetSRID(ST_MakePoint(142.33876, 43.774246), 4326)::geography,
  'published', 'quiet',
  '70年以上続く餅菓子屋さん。よもぎ大福が並ぶ時期もあるよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000e',
  null,
  now() - interval '156 days',
  now() + interval '7 days',
  now() - interval '83 days',
  now() - interval '160 days'
) on conflict (id) do nothing;

-- 旭川・3条通・居酒屋・新子焼き
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000002a',
  (select id from cities where slug = 'asahikawa'),
  '三代目 かん太郎',
  '北海道旭川市3条通13丁目右1',
  '3条通',
  '居酒屋・新子焼き',
  ST_SetSRID(ST_MakePoint(142.368713, 43.765362), 4326)::geography,
  'published', 'quiet',
  '昭和22年からのタレで焼く新子焼き。持ち帰りもできるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000010',
  null,
  now() - interval '394 days',
  now() + interval '18 days',
  now() - interval '72 days',
  now() - interval '399 days'
) on conflict (id) do nothing;

-- 旭川・旭町・銭湯
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000002b',
  (select id from cities where slug = 'asahikawa'),
  '萬石湯',
  '北海道旭川市旭町1条9丁目',
  '旭町',
  '銭湯',
  ST_SetSRID(ST_MakePoint(142.349854, 43.787777), 4326)::geography,
  'published', 'quiet',
  '昭和30年からの町の銭湯でね、サウナもあるんだよ',
  'yearly',
  'b0000000-0000-4000-8000-00000000000f',
  null,
  now() - interval '355 days',
  now() + interval '13 days',
  now() - interval '77 days',
  now() - interval '359 days'
) on conflict (id) do nothing;

-- 旭川・銀座通り（3条通15丁目）・市場・商店街
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000002c',
  (select id from cities where slug = 'asahikawa'),
  '旭川銀座商店街',
  '北海道旭川市3条通15丁目',
  '銀座通り（3条通15丁目）',
  '市場・商店街',
  ST_SetSRID(ST_MakePoint(142.371704, 43.764458), 4326)::geography,
  'published', 'quiet',
  '大正からの市場もある、市民の台所って呼ばれる通りだよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000000f',
  null,
  now() - interval '65 days',
  now() + interval '58 days',
  now() - interval '32 days',
  now() - interval '70 days'
) on conflict (id) do nothing;

-- 旭川・7条通・塩ホルモン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000002d',
  (select id from cities where slug = 'asahikawa'),
  '馬場ホルモン',
  '北海道旭川市7条通8丁目右4',
  '7条通',
  '塩ホルモン',
  ST_SetSRID(ST_MakePoint(142.363754, 43.771996), 4326)::geography,
  'published', 'crowding',
  '注文は塩ホルモンと飲みものだけ。七輪で焼くんだよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000010',
  null,
  now() - interval '489 days',
  now() + interval '68 days',
  now() - interval '22 days',
  now() - interval '497 days'
) on conflict (id) do nothing;

-- 旭川・1条通・駅前・ラーメン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000002e',
  (select id from cities where slug = 'asahikawa'),
  'らーめん山頭火 旭川本店',
  '北海道旭川市1条通8丁目348-6 MANNY BLD 1F',
  '1条通・駅前',
  'ラーメン',
  ST_SetSRID(ST_MakePoint(142.359879, 43.765331), 4326)::geography,
  'published', 'touristy',
  '1988年に旭川で生まれた、らーめん山頭火の本店だよ',
  'yearly',
  'b0000000-0000-4000-8000-00000000000e',
  null,
  now() - interval '504 days',
  now() + interval '44 days',
  now() - interval '46 days',
  now() - interval '507 days'
) on conflict (id) do nothing;

-- 富良野・緑町・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000002f',
  (select id from cities where slug = 'furano'),
  '山香食堂',
  '北海道富良野市緑町9-20',
  '緑町',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(142.395966, 43.334896), 4326)::geography,
  'published', 'quiet',
  'お昼だけ開いてる家庭的な食堂。日替わり定食もオムカレーもあるよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000012',
  null,
  now() - interval '127 days',
  now() + interval '87 days',
  now() - interval '3 days',
  now() - interval '131 days'
) on conflict (id) do nothing;

-- 富良野・本町・寿司・和食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000030',
  (select id from cities where slug = 'furano'),
  '京寿司 お食事処 池田屋',
  '北海道富良野市本町4-3',
  '本町',
  '寿司・和食',
  ST_SetSRID(ST_MakePoint(142.386322, 43.347549), 4326)::geography,
  'published', 'quiet',
  '大正9年からのお寿司屋さん。お昼は海鮮丼や寿司と天ぷらの定食もあるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000013',
  null,
  now() - interval '546 days',
  now() + interval '89 days',
  now() - interval '1 days',
  now() - interval '549 days'
) on conflict (id) do nothing;

-- 富良野・幸町・そば・食堂
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000031',
  (select id from cities where slug = 'furano'),
  'そば処 小玉家 本店',
  '北海道富良野市幸町5-1',
  '幸町',
  'そば・食堂',
  ST_SetSRID(ST_MakePoint(142.387222, 43.344482), 4326)::geography,
  'published', 'quiet',
  '駅から歩いて5分のおそば屋さん。座敷もあって家族でも入りやすいよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000011',
  null,
  now() - interval '70 days',
  now() + interval '84 days',
  now() - interval '6 days',
  now() - interval '75 days'
) on conflict (id) do nothing;

-- 富良野・日の出町・ラーメン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000032',
  (select id from cities where slug = 'furano'),
  '富川製麺所 日の出店',
  '北海道富良野市日の出町12-22 島田ビル1F',
  '日の出町',
  'ラーメン',
  ST_SetSRID(ST_MakePoint(142.388397, 43.345253), 4326)::geography,
  'published', 'quiet',
  '麺はお店で作ってて、5種類をスープに合わせて使い分けてるんだって',
  'monthly',
  'b0000000-0000-4000-8000-000000000011',
  null,
  now() - interval '246 days',
  now() + interval '67 days',
  now() - interval '23 days',
  now() - interval '253 days'
) on conflict (id) do nothing;

-- 富良野・朝日町（十字街）・和菓子・洋菓子
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000033',
  (select id from cities where slug = 'furano'),
  '菓子司 新谷',
  '北海道富良野市朝日町4-7',
  '朝日町（十字街）',
  '和菓子・洋菓子',
  ST_SetSRID(ST_MakePoint(142.388794, 43.347744), 4326)::geography,
  'published', 'quiet',
  '大正3年に菓子問屋で始まったお店。へそのおまんぢうは美瑛の小豆入りだよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000011',
  null,
  now() - interval '361 days',
  now() + interval '14 days',
  now() - interval '76 days',
  now() - interval '366 days'
) on conflict (id) do nothing;

-- 富良野・富良野駅前・焼き鳥・居酒屋
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000034',
  (select id from cities where slug = 'furano'),
  '炭焼 串てつ',
  '北海道富良野市朝日町1-20',
  '富良野駅前',
  '焼き鳥・居酒屋',
  ST_SetSRID(ST_MakePoint(142.389496, 43.347149), 4326)::geography,
  'published', 'quiet',
  '駅からすぐの焼き鳥屋さん。50種類以上あって、お昼は定食もやってるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000012',
  null,
  now() - interval '517 days',
  now() + interval '72 days',
  now() - interval '18 days',
  now() - interval '523 days'
) on conflict (id) do nothing;

-- 富良野・幸町（フラノマルシェ2向かい）・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000035',
  (select id from cities where slug = 'furano'),
  'ブーランジェリーラフィ',
  '北海道富良野市幸町7-24',
  '幸町（フラノマルシェ2向かい）',
  'パン',
  ST_SetSRID(ST_MakePoint(142.388184, 43.342697), 4326)::geography,
  'published', 'crowding',
  '北海道の小麦で焼くパン屋さん。お店の中に座って食べられる席もあるよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000013',
  null,
  now() - interval '556 days',
  now() + interval '31 days',
  now() - interval '59 days',
  now() - interval '559 days'
) on conflict (id) do nothing;

-- 富良野・日の出町・カレー
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000036',
  (select id from cities where slug = 'furano'),
  '唯我独尊',
  '北海道富良野市日の出町11-8',
  '日の出町',
  'カレー',
  ST_SetSRID(ST_MakePoint(142.389297, 43.344826), 4326)::geography,
  'published', 'crowding',
  '昭和49年からのカレー屋さん。手作りソーセージも名物で、混む時間は並ぶよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000011',
  null,
  now() - interval '456 days',
  now() + interval '74 days',
  now() - interval '16 days',
  now() - interval '461 days'
) on conflict (id) do nothing;

-- 富良野・日の出町・郷土料理・和食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000037',
  (select id from cities where slug = 'furano'),
  'くまげら',
  '北海道富良野市日の出町3-22',
  '日の出町',
  '郷土料理・和食',
  ST_SetSRID(ST_MakePoint(142.391327, 43.344624), 4326)::geography,
  'published', 'touristy',
  '「北の国から」のロケ地になったお店。和牛ローストビーフ丼が名物だよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000013',
  null,
  now() - interval '47 days',
  now() + interval '76 days',
  now() - interval '14 days',
  now() - interval '53 days'
) on conflict (id) do nothing;

-- 釧路・栄町（釧路川沿い）・喫茶
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000038',
  (select id from cities where slug = 'kushiro'),
  'ちゃーり',
  '北海道釧路市栄町2-15',
  '栄町（釧路川沿い）',
  '喫茶',
  ST_SetSRID(ST_MakePoint(144.388596, 42.983135), 4326)::geography,
  'published', 'quiet',
  '猫がお出迎えする昭和の喫茶でね、夜遅くまでパフェが食べられるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000016',
  null,
  now() - interval '532 days',
  now() + interval '86 days',
  now() - interval '4 days',
  now() - interval '540 days'
) on conflict (id) do nothing;

-- 釧路・浪花町（釧路駅西）・ラーメン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000039',
  (select id from cities where slug = 'kushiro'),
  'ラーメン銀水',
  '北海道釧路市浪花町12丁目1',
  '浪花町（釧路駅西）',
  'ラーメン',
  ST_SetSRID(ST_MakePoint(144.376999, 42.987534), 4326)::geography,
  'published', 'quiet',
  '昭和10年からのお店でね、あっさり醤油の釧路ラーメンだよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000015',
  null,
  now() - interval '154 days',
  now() + interval '84 days',
  now() - interval '6 days',
  now() - interval '157 days'
) on conflict (id) do nothing;

-- 釧路・駅前（黒金町）・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000003a',
  (select id from cities where slug = 'kushiro'),
  'むらかみ食堂',
  '北海道釧路市黒金町14丁目9-1 2階',
  '駅前（黒金町）',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(144.380325, 42.990414), 4326)::geography,
  'published', 'quiet',
  '駅のそばの2階、カウンター10席。夜だけ開く昭和の食堂だよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000014',
  null,
  now() - interval '104 days',
  now() + interval '89 days',
  now() - interval '1 days',
  now() - interval '111 days'
) on conflict (id) do nothing;

-- 釧路・光陽町・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000003b',
  (select id from cities where slug = 'kushiro'),
  'bakery house MEGUMIYA',
  '北海道釧路市光陽町23-5',
  '光陽町',
  'パン',
  ST_SetSRID(ST_MakePoint(144.390686, 43.004627), 4326)::geography,
  'published', 'quiet',
  '道産小麦のパン屋さんでね、併設のカフェでひと休みもできるよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000015',
  null,
  now() - interval '199 days',
  now() + interval '71 days',
  now() - interval '19 days',
  now() - interval '204 days'
) on conflict (id) do nothing;

-- 釧路・南大通（南大通商店街）・和菓子・餅
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000003c',
  (select id from cities where slug = 'kushiro'),
  '成田餅菓子店',
  '北海道釧路市南大通3丁目1-9',
  '南大通（南大通商店街）',
  '和菓子・餅',
  ST_SetSRID(ST_MakePoint(144.382355, 42.977867), 4326)::geography,
  'published', 'quiet',
  '明治から続く餅菓子屋さん。大福や串団子が並んでるよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000014',
  null,
  now() - interval '401 days',
  now() + interval '62 days',
  now() - interval '28 days',
  now() - interval '407 days'
) on conflict (id) do nothing;

-- 釧路・新栄町・銭湯
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000003d',
  (select id from cities where slug = 'kushiro'),
  '栄湯',
  '北海道釧路市新栄町1-20',
  '新栄町',
  '銭湯',
  ST_SetSRID(ST_MakePoint(144.381622, 42.995872), 4326)::geography,
  'published', 'quiet',
  'サウナと地下水の水風呂がある町の銭湯。土曜は朝8時からだよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000014',
  null,
  now() - interval '456 days',
  now() + interval '26 days',
  now() - interval '64 days',
  now() - interval '464 days'
) on conflict (id) do nothing;

-- 釧路・南大通・寿司
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000003e',
  (select id from cities where slug = 'kushiro'),
  '吉江寿司',
  '北海道釧路市南大通3丁目1-3',
  '南大通',
  '寿司',
  ST_SetSRID(ST_MakePoint(144.38298, 42.97831), 4326)::geography,
  'published', 'quiet',
  '昼の生ちらしが人気でね、ご飯がなくなると昼はおしまいだよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000014',
  null,
  now() - interval '330 days',
  now() + interval '24 days',
  now() - interval '66 days',
  now() - interval '335 days'
) on conflict (id) do nothing;

-- 釧路・栄町（末広・栄町の飲み屋街）・居酒屋
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000003f',
  (select id from cities where slug = 'kushiro'),
  'つぶ焼 かど屋',
  '北海道釧路市栄町4-1',
  '栄町（末広・栄町の飲み屋街）',
  '居酒屋',
  ST_SetSRID(ST_MakePoint(144.387299, 42.984074), 4326)::geography,
  'published', 'crowding',
  'つぶ焼とラーメンの二品だけ。夜から日付が変わる頃まで開いてるよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000014',
  null,
  now() - interval '527 days',
  now() + interval '47 days',
  now() - interval '43 days',
  now() - interval '530 days'
) on conflict (id) do nothing;

-- 釧路・末広町・洋食（スパカツ）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000040',
  (select id from cities where slug = 'kushiro'),
  'レストラン泉屋 総本店',
  '北海道釧路市末広町2丁目28',
  '末広町',
  '洋食（スパカツ）',
  ST_SetSRID(ST_MakePoint(144.387161, 42.982552), 4326)::geography,
  'published', 'crowding',
  '昭和34年創業、熱々の鉄皿で出てくるスパカツの元祖だよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000014',
  null,
  now() - interval '461 days',
  now() + interval '32 days',
  now() - interval '58 days',
  now() - interval '469 days'
) on conflict (id) do nothing;

-- 釧路・駅前（黒金町）・市場
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000041',
  (select id from cities where slug = 'kushiro'),
  '釧路和商市場',
  '北海道釧路市黒金町13丁目25',
  '駅前（黒金町）',
  '市場',
  ST_SetSRID(ST_MakePoint(144.379898, 42.989204), 4326)::geography,
  'published', 'touristy',
  '好きな具を選んでのせる勝手丼の市場。日曜はお休みが多いよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000016',
  null,
  now() - interval '161 days',
  now() + interval '81 days',
  now() - interval '9 days',
  now() - interval '167 days'
) on conflict (id) do nothing;

-- 帯広・帯広駅北口・食堂・洋食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000042',
  (select id from cities where slug = 'obihiro'),
  'お食事・ご宴会 ふじもり',
  '北海道帯広市西2条南11丁目8-1',
  '帯広駅北口',
  '食堂・洋食',
  ST_SetSRID(ST_MakePoint(143.202835, 42.919662), 4326)::geography,
  'published', 'quiet',
  '明治からある駅前の食堂でね、席に着くとメロンソーダが出てくるんだよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000019',
  null,
  now() - interval '465 days',
  now() + interval '85 days',
  now() - interval '5 days',
  now() - interval '472 days'
) on conflict (id) do nothing;

-- 帯広・東1条・甘味・大判焼
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000043',
  (select id from cities where slug = 'obihiro'),
  '高橋まんじゅう屋',
  '北海道帯広市東1条南5丁目19-4',
  '東1条',
  '甘味・大判焼',
  ST_SetSRID(ST_MakePoint(143.205948, 42.926907), 4326)::geography,
  'published', 'crowding',
  '大判焼はあんとチーズの2種類。学生さんも仕事帰りの人もよく寄ってるよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000018',
  null,
  now() - interval '76 days',
  now() + interval '88 days',
  now() - interval '2 days',
  now() - interval '82 days'
) on conflict (id) do nothing;

-- 帯広・東3条・銭湯（モール温泉）
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000044',
  (select id from cities where slug = 'obihiro'),
  'アサヒ湯',
  '北海道帯広市東3条南14丁目19',
  '東3条',
  '銭湯（モール温泉）',
  ST_SetSRID(ST_MakePoint(143.210464, 42.916695), 4326)::geography,
  'published', 'quiet',
  '源泉かけ流しのモール温泉に銭湯の値段で入れるの。日曜は朝風呂もあるよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000018',
  null,
  now() - interval '245 days',
  now() + interval '89 days',
  now() - interval '1 days',
  now() - interval '250 days'
) on conflict (id) do nothing;

-- 帯広・広小路・ラーメン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000045',
  (select id from cities where slug = 'obihiro'),
  'らーめん みすゞ',
  '北海道帯広市西2条南8丁目20 広小路アーケード内',
  '広小路',
  'ラーメン',
  ST_SetSRID(ST_MakePoint(143.202377, 42.923138), 4326)::geography,
  'published', 'quiet',
  '広小路のアーケードの中のお店。ピリ辛のみすゞらーめんが定番なんだよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000017',
  null,
  now() - interval '266 days',
  now() + interval '44 days',
  now() - interval '46 days',
  now() - interval '273 days'
) on conflict (id) do nothing;

-- 帯広・帯広駅北口・豚丼
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000046',
  (select id from cities where slug = 'obihiro'),
  '元祖豚丼のぱんちょう',
  '北海道帯広市西1条南11丁目19',
  '帯広駅北口',
  '豚丼',
  ST_SetSRID(ST_MakePoint(143.203613, 42.91972), 4326)::geography,
  'published', 'touristy',
  '昭和8年からの豚丼のお店。お昼は並ぶ日もあるから時間をずらすといいよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000019',
  null,
  now() - interval '451 days',
  now() + interval '13 days',
  now() - interval '77 days',
  now() - interval '457 days'
) on conflict (id) do nothing;

-- 帯広・帯広駅北口・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000047',
  (select id from cities where slug = 'obihiro'),
  '満寿屋商店 本店（ますやパン）',
  '北海道帯広市西1条南10丁目2',
  '帯広駅北口',
  'パン',
  ST_SetSRID(ST_MakePoint(143.204254, 42.920933), 4326)::geography,
  'published', 'quiet',
  '昭和25年からのパン屋さんの1号店。あんパンやクリームパンが人気だよ',
  'weekly',
  'b0000000-0000-4000-8000-000000000018',
  null,
  now() - interval '360 days',
  now() + interval '75 days',
  now() - interval '15 days',
  now() - interval '365 days'
) on conflict (id) do nothing;

-- 帯広・西21条（卸売市場）・市場・鮮魚
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000048',
  (select id from cities where slug = 'obihiro'),
  'とかち帯広場外市場 一鱗',
  '北海道帯広市西21条北1丁目5-1 帯広地方卸売市場内',
  '西21条（卸売市場）',
  '市場・鮮魚',
  ST_SetSRID(ST_MakePoint(143.137726, 42.93121), 4326)::geography,
  'published', 'quiet',
  '卸売市場の中の売り場でね、朝6時から魚も野菜も一般の人が買えるんだよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000018',
  null,
  now() - interval '258 days',
  now() + interval '16 days',
  now() - interval '74 days',
  now() - interval '262 days'
) on conflict (id) do nothing;

-- 帯広・帯広駅北口・焼肉・ジンギスカン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000049',
  (select id from cities where slug = 'obihiro'),
  '焼肉レストラン 平和園 本店',
  '北海道帯広市大通南12丁目3 サンバリエビル1F',
  '帯広駅北口',
  '焼肉・ジンギスカン',
  ST_SetSRID(ST_MakePoint(143.20578, 42.918705), 4326)::geography,
  'published', 'crowding',
  '昭和34年からの焼肉屋さん。ジンギスカンはひと切れずつ手で切ってるんだって',
  'monthly',
  'b0000000-0000-4000-8000-000000000017',
  null,
  now() - interval '227 days',
  now() + interval '30 days',
  now() - interval '60 days',
  now() - interval '233 days'
) on conflict (id) do nothing;

-- 帯広・公園東町・喫茶
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000004a',
  (select id from cities where slug = 'obihiro'),
  'のらくろ喫茶店',
  '北海道帯広市公園東町3丁目2-2',
  '公園東町',
  '喫茶',
  ST_SetSRID(ST_MakePoint(143.194183, 42.909145), 4326)::geography,
  'published', 'quiet',
  '昭和55年からの喫茶店。のらくろが描かれたカップでコーヒーが出てくるよ',
  'monthly',
  'b0000000-0000-4000-8000-000000000019',
  null,
  now() - interval '150 days',
  now() + interval '33 days',
  now() - interval '57 days',
  now() - interval '156 days'
) on conflict (id) do nothing;

-- 帯広・八丁堀・居酒屋
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000004b',
  (select id from cities where slug = 'obihiro'),
  '大衆酒場 一大',
  '北海道帯広市西1条南8丁目12 八丁堀',
  '八丁堀',
  '居酒屋',
  ST_SetSRID(ST_MakePoint(143.203949, 42.923244), 4326)::geography,
  'published', 'quiet',
  '8席くらいのカウンターのお店。千ベロセットで軽く一杯やれるよ',
  'yearly',
  'b0000000-0000-4000-8000-000000000019',
  null,
  now() - interval '107 days',
  now() + interval '7 days',
  now() - interval '83 days',
  now() - interval '111 days'
) on conflict (id) do nothing;

-- 稚内・中央（稚内駅前）・食堂・海鮮
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000004c',
  (select id from cities where slug = 'wakkanai'),
  'ひとしの店',
  '北海道稚内市中央2丁目11-20',
  '中央（稚内駅前）',
  '食堂・海鮮',
  ST_SetSRID(ST_MakePoint(141.676697, 45.417278), 4326)::geography,
  'published', 'quiet',
  '朝6時半から開く駅前の食堂でね、名物はかにめしだよ',
  'monthly',
  'b0000000-0000-4000-8000-00000000001c',
  null,
  now() - interval '325 days',
  now() + interval '89 days',
  now() - interval '1 days',
  now() - interval '333 days'
) on conflict (id) do nothing;

-- 稚内・中央（バス通り）・食堂・定食
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000004d',
  (select id from cities where slug = 'wakkanai'),
  '中央食堂',
  '北海道稚内市中央4丁目14-36',
  '中央（バス通り）',
  '食堂・定食',
  ST_SetSRID(ST_MakePoint(141.674194, 45.412464), 4326)::geography,
  'published', 'quiet',
  '2025年にできた定食屋さん。夜は刺身盛りで一杯もできるよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000001b',
  null,
  now() - interval '169 days',
  now() + interval '86 days',
  now() - interval '4 days',
  now() - interval '174 days'
) on conflict (id) do nothing;

-- 稚内・中央・そば
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000004e',
  (select id from cities where slug = 'wakkanai'),
  'そば処 壱文',
  '北海道稚内市中央4丁目2-17',
  '中央',
  'そば',
  ST_SetSRID(ST_MakePoint(141.674271, 45.413971), 4326)::geography,
  'published', 'quiet',
  '毎朝手打ちするおそば屋さん。麺がなくなったらおしまいだよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000001b',
  null,
  now() - interval '529 days',
  now() + interval '84 days',
  now() - interval '6 days',
  now() - interval '536 days'
) on conflict (id) do nothing;

-- 稚内・中央・喫茶・カレー
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-00000000004f',
  (select id from cities where slug = 'wakkanai'),
  'ピン・カートン',
  '北海道稚内市中央4丁目10-23',
  '中央',
  '喫茶・カレー',
  ST_SetSRID(ST_MakePoint(141.674133, 45.413845), 4326)::geography,
  'published', 'quiet',
  'クラシックが流れる喫茶でね、カレーが看板メニューだよ',
  'monthly',
  'b0000000-0000-4000-8000-00000000001a',
  null,
  now() - interval '46 days',
  now() + interval '45 days',
  now() - interval '45 days',
  now() - interval '53 days'
) on conflict (id) do nothing;

-- 稚内・中央（稚内駅前）・パン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000050',
  (select id from cities where slug = 'wakkanai'),
  '北のはしベーカリー',
  '北海道稚内市中央3丁目5-8 相沢食料百貨店1F',
  '中央（稚内駅前）',
  'パン',
  ST_SetSRID(ST_MakePoint(141.676178, 45.416965), 4326)::geography,
  'published', 'quiet',
  '道産小麦で、卵や乳を使わないパンを焼いてるお店だよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000001b',
  null,
  now() - interval '467 days',
  now() + interval '29 days',
  now() - interval '61 days',
  now() - interval '471 days'
) on conflict (id) do nothing;

-- 稚内・緑（南稚内）・銭湯
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000051',
  (select id from cities where slug = 'wakkanai'),
  'みどり湯',
  '北海道稚内市緑1丁目10-23',
  '緑（南稚内）',
  '銭湯',
  ST_SetSRID(ST_MakePoint(141.685242, 45.394333), 4326)::geography,
  'published', 'quiet',
  '日本最北の銭湯でね、お惣菜コーナーやスナックもあるよ',
  'weekly',
  'b0000000-0000-4000-8000-00000000001c',
  null,
  now() - interval '324 days',
  now() + interval '14 days',
  now() - interval '76 days',
  now() - interval '329 days'
) on conflict (id) do nothing;

-- 稚内・大黒（南稚内）・居酒屋
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000052',
  (select id from cities where slug = 'wakkanai'),
  '甚八',
  '北海道稚内市大黒2丁目2',
  '大黒（南稚内）',
  '居酒屋',
  ST_SetSRID(ST_MakePoint(141.684479, 45.398335), 4326)::geography,
  'published', 'quiet',
  '季節の魚が並ぶ大黒の居酒屋。日曜と祝日はお休みだよ',
  'monthly',
  'b0000000-0000-4000-8000-00000000001a',
  null,
  now() - interval '261 days',
  now() + interval '42 days',
  now() - interval '48 days',
  now() - interval '266 days'
) on conflict (id) do nothing;

-- 稚内・中央（稚内駅前）・ラーメン
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000053',
  (select id from cities where slug = 'wakkanai'),
  'ラーメンのたからや',
  '北海道稚内市中央2丁目11-15',
  '中央（稚内駅前）',
  'ラーメン',
  ST_SetSRID(ST_MakePoint(141.67688, 45.41761), 4326)::geography,
  'published', 'crowding',
  '透きとおった塩ラーメンのお店。お昼の短い時間だけ開いてるよ',
  'yearly',
  'b0000000-0000-4000-8000-00000000001c',
  null,
  now() - interval '401 days',
  now() + interval '63 days',
  now() - interval '27 days',
  now() - interval '404 days'
) on conflict (id) do nothing;

-- 稚内・ノシャップ・海鮮食堂・鮮魚
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000054',
  (select id from cities where slug = 'wakkanai'),
  '漁師の店',
  '北海道稚内市ノシャップ2丁目3-8',
  'ノシャップ',
  '海鮮食堂・鮮魚',
  ST_SetSRID(ST_MakePoint(141.647049, 45.447166), 4326)::geography,
  'published', 'crowding',
  '漁師さん夫婦がやってる食堂兼魚屋さん。冬は休む時期があるよ',
  'yearly',
  'b0000000-0000-4000-8000-00000000001c',
  null,
  now() - interval '86 days',
  now() + interval '46 days',
  now() - interval '44 days',
  now() - interval '91 days'
) on conflict (id) do nothing;

-- 稚内・港（副港）・市場・温泉施設
insert into spots (
  id, city_id, name, address, area_name, category, location,
  status, quietness, reason, visit_frequency, author_id, photo_url,
  published_at, next_verification_at, last_verified_at, created_at
) values (
  'd0000000-0000-4000-8000-000000000055',
  (select id from cities where slug = 'wakkanai'),
  '稚内副港市場',
  '北海道稚内市港1丁目6-28',
  '港（副港）',
  '市場・温泉施設',
  ST_SetSRID(ST_MakePoint(141.675797, 45.408436), 4326)::geography,
  'published', 'touristy',
  '市場に食堂、温泉の港のゆ、樺太記念館まで入った港の施設だよ',
  'yearly',
  'b0000000-0000-4000-8000-00000000001c',
  null,
  now() - interval '314 days',
  now() + interval '8 days',
  now() - interval '82 days',
  now() - interval '320 days'
) on conflict (id) do nothing;

insert into spot_tags (spot_id, tag_id) values
  ('d0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000000007'),
  ('d0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-00000000000c', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000000d', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000000e', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000000f', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000000f', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000010', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000011', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000005'),
  ('d0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000012', 'e0000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000013', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000014', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000004'),
  ('d0000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000015', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000016', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000017', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000018', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000001b', 'e0000000-0000-4000-8000-000000000004'),
  ('d0000000-0000-4000-8000-00000000001b', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-00000000001b', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000001c', 'e0000000-0000-4000-8000-000000000004'),
  ('d0000000-0000-4000-8000-00000000001c', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-00000000001c', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000001d', 'e0000000-0000-4000-8000-000000000005'),
  ('d0000000-0000-4000-8000-00000000001d', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000001d', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000001e', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000001e', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000001f', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000001f', 'e0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-000000000020', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000020', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000020', 'e0000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000021', 'e0000000-0000-4000-8000-000000000007'),
  ('d0000000-0000-4000-8000-000000000022', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000023', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000024', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000025', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000025', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000026', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000027', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000028', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000028', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000029', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000002a', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-00000000002a', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000002b', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000002c', 'e0000000-0000-4000-8000-000000000004'),
  ('d0000000-0000-4000-8000-00000000002c', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000002d', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-00000000002e', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000002f', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000002f', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000031', 'e0000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-000000000032', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000033', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000035', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000035', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000038', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000039', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000003a', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-00000000003a', 'e0000000-0000-4000-8000-000000000007'),
  ('d0000000-0000-4000-8000-00000000003a', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000003b', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000003b', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000003c', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000003c', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000003d', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000003e', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000003f', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-00000000003f', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000041', 'e0000000-0000-4000-8000-000000000004'),
  ('d0000000-0000-4000-8000-000000000041', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000041', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000042', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000043', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000043', 'e0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-000000000045', 'e0000000-0000-4000-8000-000000000007'),
  ('d0000000-0000-4000-8000-000000000045', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000045', 'e0000000-0000-4000-8000-000000000009'),
  ('d0000000-0000-4000-8000-000000000046', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000047', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000047', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000047', 'e0000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-000000000048', 'e0000000-0000-4000-8000-000000000004'),
  ('d0000000-0000-4000-8000-000000000048', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000048', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000049', 'e0000000-0000-4000-8000-00000000000a'),
  ('d0000000-0000-4000-8000-00000000004a', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000004a', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000004b', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-00000000004b', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000004c', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000004c', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000004c', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-00000000004d', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000004e', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-00000000004e', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-00000000004f', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000050', 'e0000000-0000-4000-8000-000000000002'),
  ('d0000000-0000-4000-8000-000000000051', 'e0000000-0000-4000-8000-000000000008'),
  ('d0000000-0000-4000-8000-000000000052', 'e0000000-0000-4000-8000-000000000003'),
  ('d0000000-0000-4000-8000-000000000053', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000053', 'e0000000-0000-4000-8000-000000000007'),
  ('d0000000-0000-4000-8000-000000000054', 'e0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000054', 'e0000000-0000-4000-8000-000000000006'),
  ('d0000000-0000-4000-8000-000000000054', 'e0000000-0000-4000-8000-000000000007'),
  ('d0000000-0000-4000-8000-000000000055', 'e0000000-0000-4000-8000-000000000004')
on conflict do nothing;

insert into endorsements (spot_id, user_id, created_at) values
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000003', now() - interval '170 days'),
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000005', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', now() - interval '60 days'),
  ('d0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000003', now() - interval '58 days'),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000003', now() - interval '170 days'),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000005', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000002', now() - interval '170 days'),
  ('d0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000005', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000002', now() - interval '170 days'),
  ('d0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000003', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-000000000002', now() - interval '107 days'),
  ('d0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-000000000005', now() - interval '105 days'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000002', now() - interval '151 days'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000005', now() - interval '149 days'),
  ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000003', now() - interval '170 days'),
  ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000005', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000006', now() - interval '185 days'),
  ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000008', now() - interval '183 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000006', now() - interval '220 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000007', now() - interval '218 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000006', now() - interval '390 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000007', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000006', now() - interval '390 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000007', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000006', now() - interval '98 days'),
  ('d0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000007', now() - interval '96 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000007', now() - interval '390 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000008', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000006', now() - interval '278 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000007', now() - interval '276 days'),
  ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000007', now() - interval '222 days'),
  ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000008', now() - interval '220 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000007', now() - interval '390 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000008', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000c', now() - interval '299 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000d', now() - interval '297 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000c', now() - interval '113 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000d', now() - interval '111 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000b', now() - interval '508 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000c', now() - interval '506 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000b', now() - interval '436 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000c', now() - interval '434 days'),
  ('d0000000-0000-4000-8000-00000000001f', 'b0000000-0000-4000-8000-00000000000b', now() - interval '79 days'),
  ('d0000000-0000-4000-8000-00000000001f', 'b0000000-0000-4000-8000-00000000000d', now() - interval '77 days'),
  ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-00000000000b', now() - interval '134 days'),
  ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-00000000000c', now() - interval '132 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000b', now() - interval '512 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000c', now() - interval '510 days'),
  ('d0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-00000000000c', now() - interval '137 days'),
  ('d0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-00000000000d', now() - interval '135 days'),
  ('d0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-00000000000b', now() - interval '77 days'),
  ('d0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-00000000000c', now() - interval '75 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000c', now() - interval '467 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000d', now() - interval '465 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000f', now() - interval '279 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-000000000010', now() - interval '277 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-00000000000e', now() - interval '477 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-00000000000f', now() - interval '475 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-00000000000e', now() - interval '460 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-00000000000f', now() - interval '458 days'),
  ('d0000000-0000-4000-8000-000000000028', 'b0000000-0000-4000-8000-00000000000e', now() - interval '135 days'),
  ('d0000000-0000-4000-8000-000000000028', 'b0000000-0000-4000-8000-000000000010', now() - interval '133 days'),
  ('d0000000-0000-4000-8000-000000000029', 'b0000000-0000-4000-8000-00000000000f', now() - interval '158 days'),
  ('d0000000-0000-4000-8000-000000000029', 'b0000000-0000-4000-8000-000000000010', now() - interval '156 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-00000000000e', now() - interval '396 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-00000000000f', now() - interval '394 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000e', now() - interval '357 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-000000000010', now() - interval '355 days'),
  ('d0000000-0000-4000-8000-00000000002c', 'b0000000-0000-4000-8000-00000000000e', now() - interval '67 days'),
  ('d0000000-0000-4000-8000-00000000002c', 'b0000000-0000-4000-8000-000000000010', now() - interval '65 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-00000000000e', now() - interval '491 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-00000000000f', now() - interval '489 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000f', now() - interval '506 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-000000000010', now() - interval '504 days'),
  ('d0000000-0000-4000-8000-00000000002f', 'b0000000-0000-4000-8000-000000000011', now() - interval '129 days'),
  ('d0000000-0000-4000-8000-00000000002f', 'b0000000-0000-4000-8000-000000000013', now() - interval '127 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000011', now() - interval '548 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000012', now() - interval '546 days'),
  ('d0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000012', now() - interval '72 days'),
  ('d0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000013', now() - interval '70 days'),
  ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000012', now() - interval '248 days'),
  ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000013', now() - interval '246 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000012', now() - interval '363 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000013', now() - interval '361 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000011', now() - interval '519 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000013', now() - interval '517 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000011', now() - interval '558 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000012', now() - interval '556 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000012', now() - interval '458 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000013', now() - interval '456 days'),
  ('d0000000-0000-4000-8000-000000000037', 'b0000000-0000-4000-8000-000000000011', now() - interval '49 days'),
  ('d0000000-0000-4000-8000-000000000037', 'b0000000-0000-4000-8000-000000000012', now() - interval '47 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000014', now() - interval '534 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000015', now() - interval '532 days'),
  ('d0000000-0000-4000-8000-000000000039', 'b0000000-0000-4000-8000-000000000014', now() - interval '156 days'),
  ('d0000000-0000-4000-8000-000000000039', 'b0000000-0000-4000-8000-000000000016', now() - interval '154 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000015', now() - interval '106 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000016', now() - interval '104 days'),
  ('d0000000-0000-4000-8000-00000000003b', 'b0000000-0000-4000-8000-000000000014', now() - interval '201 days'),
  ('d0000000-0000-4000-8000-00000000003b', 'b0000000-0000-4000-8000-000000000016', now() - interval '199 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000015', now() - interval '403 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000016', now() - interval '401 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000015', now() - interval '458 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000016', now() - interval '456 days'),
  ('d0000000-0000-4000-8000-00000000003e', 'b0000000-0000-4000-8000-000000000015', now() - interval '332 days'),
  ('d0000000-0000-4000-8000-00000000003e', 'b0000000-0000-4000-8000-000000000016', now() - interval '330 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000015', now() - interval '529 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000016', now() - interval '527 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000015', now() - interval '463 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000016', now() - interval '461 days'),
  ('d0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000014', now() - interval '163 days'),
  ('d0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000015', now() - interval '161 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000017', now() - interval '467 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000018', now() - interval '465 days'),
  ('d0000000-0000-4000-8000-000000000043', 'b0000000-0000-4000-8000-000000000017', now() - interval '78 days'),
  ('d0000000-0000-4000-8000-000000000043', 'b0000000-0000-4000-8000-000000000019', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000017', now() - interval '247 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000019', now() - interval '245 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000018', now() - interval '268 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000019', now() - interval '266 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000017', now() - interval '453 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000018', now() - interval '451 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000017', now() - interval '362 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000019', now() - interval '360 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000017', now() - interval '260 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000019', now() - interval '258 days'),
  ('d0000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000018', now() - interval '229 days'),
  ('d0000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000019', now() - interval '227 days'),
  ('d0000000-0000-4000-8000-00000000004a', 'b0000000-0000-4000-8000-000000000017', now() - interval '152 days'),
  ('d0000000-0000-4000-8000-00000000004a', 'b0000000-0000-4000-8000-000000000018', now() - interval '150 days'),
  ('d0000000-0000-4000-8000-00000000004b', 'b0000000-0000-4000-8000-000000000017', now() - interval '109 days'),
  ('d0000000-0000-4000-8000-00000000004b', 'b0000000-0000-4000-8000-000000000018', now() - interval '107 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001a', now() - interval '327 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001b', now() - interval '325 days'),
  ('d0000000-0000-4000-8000-00000000004d', 'b0000000-0000-4000-8000-00000000001a', now() - interval '171 days'),
  ('d0000000-0000-4000-8000-00000000004d', 'b0000000-0000-4000-8000-00000000001c', now() - interval '169 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001a', now() - interval '531 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001c', now() - interval '529 days'),
  ('d0000000-0000-4000-8000-00000000004f', 'b0000000-0000-4000-8000-00000000001b', now() - interval '48 days'),
  ('d0000000-0000-4000-8000-00000000004f', 'b0000000-0000-4000-8000-00000000001c', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001a', now() - interval '469 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001c', now() - interval '467 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001a', now() - interval '326 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001b', now() - interval '324 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001b', now() - interval '263 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001c', now() - interval '261 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001a', now() - interval '403 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001b', now() - interval '401 days'),
  ('d0000000-0000-4000-8000-000000000054', 'b0000000-0000-4000-8000-00000000001a', now() - interval '88 days'),
  ('d0000000-0000-4000-8000-000000000054', 'b0000000-0000-4000-8000-00000000001b', now() - interval '86 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001a', now() - interval '316 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001b', now() - interval '314 days')
on conflict do nothing;

-- 確認の履歴（8. と同じ作り: 各行に回答済みの依頼を1件ずつ作って紐づける）
with src (spot_id, user_id, answer, created_at) as (values
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '145 days'),
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '55 days'),
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '55 days'),
  ('d0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000005', 'quiet', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '112 days'),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '116 days'),
  ('d0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '26 days'),
  ('d0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '26 days'),
  ('d0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000005', 'quiet', now() - interval '130 days'),
  ('d0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000005', 'quiet', now() - interval '40 days'),
  ('d0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000002', 'quiet', now() - interval '40 days'),
  ('d0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-000000000003', 'quiet', now() - interval '19 days'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000003', 'crowding', now() - interval '70 days'),
  ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002', 'crowding', now() - interval '125 days'),
  ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002', 'touristy', now() - interval '35 days'),
  ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000003', 'touristy', now() - interval '35 days'),
  ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '93 days'),
  ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000009', 'quiet', now() - interval '184 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000009', 'quiet', now() - interval '94 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000009', 'quiet', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '366 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '276 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '186 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '96 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '331 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '241 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '151 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000008', 'quiet', now() - interval '61 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '61 days'),
  ('d0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-00000000000a', 'quiet', now() - interval '37 days'),
  ('d0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '37 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '306 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '216 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '126 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '36 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000007', 'quiet', now() - interval '36 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000009', 'quiet', now() - interval '202 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000009', 'quiet', now() - interval '112 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000009', 'crowding', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000006', 'crowding', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '190 days'),
  ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '100 days'),
  ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000006', 'crowding', now() - interval '10 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '381 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '291 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000006', 'quiet', now() - interval '201 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000006', 'crowding', now() - interval '111 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000006', 'touristy', now() - interval '21 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '273 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '183 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '93 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '92 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000c', 'quiet', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '452 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '362 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '272 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '182 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '92 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '417 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '327 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '237 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '147 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '57 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '57 days'),
  ('d0000000-0000-4000-8000-00000000001f', 'b0000000-0000-4000-8000-00000000000c', 'quiet', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-00000000001f', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '47 days'),
  ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '47 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '429 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '339 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '249 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '159 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000d', 'quiet', now() - interval '69 days'),
  ('d0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '83 days'),
  ('d0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-00000000000d', 'crowding', now() - interval '17 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '424 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '334 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000b', 'quiet', now() - interval '244 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000b', 'crowding', now() - interval '154 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000b', 'touristy', now() - interval '64 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000c', 'touristy', now() - interval '64 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '271 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '181 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '451 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '361 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '271 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '181 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '456 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '366 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '276 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '186 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '96 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000028', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '124 days'),
  ('d0000000-0000-4000-8000-000000000028', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '34 days'),
  ('d0000000-0000-4000-8000-000000000029', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '83 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '342 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '252 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '162 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '72 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '72 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '347 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '257 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '167 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '77 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '77 days'),
  ('d0000000-0000-4000-8000-00000000002c', 'b0000000-0000-4000-8000-00000000000f', 'quiet', now() - interval '32 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '472 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '382 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '292 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '202 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', 'quiet', now() - interval '112 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', 'crowding', now() - interval '22 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '496 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '406 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '316 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', 'quiet', now() - interval '226 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', 'crowding', now() - interval '136 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', 'touristy', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000f', 'touristy', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-00000000002f', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '93 days'),
  ('d0000000-0000-4000-8000-00000000002f', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-00000000002f', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '3 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '541 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '451 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '361 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '271 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '181 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '203 days'),
  ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '113 days'),
  ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '23 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '346 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '256 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '166 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '468 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '378 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '288 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '198 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '108 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', 'quiet', now() - interval '18 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '509 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '419 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '329 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '239 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', 'quiet', now() - interval '149 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', 'crowding', now() - interval '59 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000011', 'crowding', now() - interval '59 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '376 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '286 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '196 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000011', 'quiet', now() - interval '106 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000011', 'crowding', now() - interval '16 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000012', 'crowding', now() - interval '16 days'),
  ('d0000000-0000-4000-8000-000000000037', 'b0000000-0000-4000-8000-000000000013', 'touristy', now() - interval '14 days'),
  ('d0000000-0000-4000-8000-000000000037', 'b0000000-0000-4000-8000-000000000011', 'touristy', now() - interval '14 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '454 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '364 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '274 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '184 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '94 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000015', 'quiet', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-000000000039', 'b0000000-0000-4000-8000-000000000015', 'quiet', now() - interval '96 days'),
  ('d0000000-0000-4000-8000-000000000039', 'b0000000-0000-4000-8000-000000000015', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-000000000039', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000015', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000016', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-00000000003b', 'b0000000-0000-4000-8000-000000000015', 'quiet', now() - interval '109 days'),
  ('d0000000-0000-4000-8000-00000000003b', 'b0000000-0000-4000-8000-000000000015', 'quiet', now() - interval '19 days'),
  ('d0000000-0000-4000-8000-00000000003b', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '19 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '298 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '208 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '118 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '28 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '424 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '334 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '244 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '154 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '64 days'),
  ('d0000000-0000-4000-8000-00000000003e', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '246 days'),
  ('d0000000-0000-4000-8000-00000000003e', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '156 days'),
  ('d0000000-0000-4000-8000-00000000003e', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '66 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '493 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '403 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '313 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '223 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '133 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', 'crowding', now() - interval '43 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '418 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '328 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '238 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000014', 'quiet', now() - interval '148 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000014', 'crowding', now() - interval '58 days'),
  ('d0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000016', 'crowding', now() - interval '99 days'),
  ('d0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000016', 'touristy', now() - interval '9 days'),
  ('d0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000014', 'touristy', now() - interval '9 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '455 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '365 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '275 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '185 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '95 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '5 days'),
  ('d0000000-0000-4000-8000-000000000043', 'b0000000-0000-4000-8000-000000000018', 'crowding', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-000000000043', 'b0000000-0000-4000-8000-000000000017', 'crowding', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-000000000043', 'b0000000-0000-4000-8000-000000000019', 'crowding', now() - interval '2 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '181 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '226 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '136 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '437 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '347 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '257 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000019', 'crowding', now() - interval '167 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000019', 'touristy', now() - interval '77 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '285 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '195 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '105 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '15 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '254 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '164 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000018', 'quiet', now() - interval '74 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '74 days'),
  ('d0000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '150 days'),
  ('d0000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000017', 'crowding', now() - interval '60 days'),
  ('d0000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000018', 'crowding', now() - interval '60 days'),
  ('d0000000-0000-4000-8000-00000000004a', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '147 days'),
  ('d0000000-0000-4000-8000-00000000004a', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '57 days'),
  ('d0000000-0000-4000-8000-00000000004a', 'b0000000-0000-4000-8000-000000000017', 'quiet', now() - interval '57 days'),
  ('d0000000-0000-4000-8000-00000000004b', 'b0000000-0000-4000-8000-000000000019', 'quiet', now() - interval '83 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '271 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '181 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '91 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '1 days'),
  ('d0000000-0000-4000-8000-00000000004d', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '94 days'),
  ('d0000000-0000-4000-8000-00000000004d', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '4 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '456 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '366 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '276 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '186 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '96 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '6 days'),
  ('d0000000-0000-4000-8000-00000000004f', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '45 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '421 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '331 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '241 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '151 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '61 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '61 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '256 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '166 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '228 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '138 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001a', 'quiet', now() - interval '48 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001b', 'quiet', now() - interval '48 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '387 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '297 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '207 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '117 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001c', 'crowding', now() - interval '27 days'),
  ('d0000000-0000-4000-8000-000000000054', 'b0000000-0000-4000-8000-00000000001c', 'crowding', now() - interval '44 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001c', 'quiet', now() - interval '262 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001c', 'crowding', now() - interval '172 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001c', 'touristy', now() - interval '82 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001a', 'touristy', now() - interval '82 days')
),
numbered as materialized (
  select
    src.spot_id::uuid as spot_id,
    src.user_id::uuid as user_id,
    src.answer::text as answer,
    src.created_at::timestamptz as created_at,
    gen_random_uuid() as request_id,
    gen_random_uuid() as verification_id
  from src
),
inserted_requests as (
  insert into verification_requests (id, spot_id, user_id, due_at, status, created_at)
  select request_id, spot_id, user_id, created_at, 'answered', created_at - interval '90 days'
  from numbered
  returning id
)
insert into verifications (id, spot_id, user_id, answer, created_at, verification_request_id)
select verification_id, spot_id, user_id, answer, created_at, request_id
from numbered
where exists (select 1 from inserted_requests r where r.id = numbered.request_id);

update verification_requests vr
set answered_verification_id = v.id
from verifications v
where v.verification_request_id = vr.id
  and vr.status = 'answered'
  and vr.answered_verification_id is null;

-- 各店の open な確認依頼（due_at = next_verification_at）
insert into verification_requests (spot_id, user_id, due_at, status, created_at) values
  ('d0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000002', now() + interval '35 days', 'open', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000005', now() + interval '68 days', 'open', now() - interval '58 days'),
  ('d0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000002', now() + interval '68 days', 'open', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000d', 'b0000000-0000-4000-8000-000000000003', now() + interval '64 days', 'open', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000e', 'b0000000-0000-4000-8000-000000000005', now() + interval '50 days', 'open', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-000000000003', now() + interval '71 days', 'open', now() - interval '105 days'),
  ('d0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000003', now() + interval '20 days', 'open', now() - interval '149 days'),
  ('d0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000002', now() + interval '55 days', 'open', now() - interval '168 days'),
  ('d0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000007', now() + interval '87 days', 'open', now() - interval '183 days'),
  ('d0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000009', now() + interval '86 days', 'open', now() - interval '218 days'),
  ('d0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000008', now() + interval '84 days', 'open', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000008', now() + interval '29 days', 'open', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-00000000000a', now() + interval '53 days', 'open', now() - interval '96 days'),
  ('d0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000006', now() + interval '54 days', 'open', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000009', now() + interval '68 days', 'open', now() - interval '276 days'),
  ('d0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000006', now() + interval '80 days', 'open', now() - interval '220 days'),
  ('d0000000-0000-4000-8000-00000000001a', 'b0000000-0000-4000-8000-000000000006', now() + interval '69 days', 'open', now() - interval '388 days'),
  ('d0000000-0000-4000-8000-00000000001b', 'b0000000-0000-4000-8000-00000000000b', now() + interval '87 days', 'open', now() - interval '297 days'),
  ('d0000000-0000-4000-8000-00000000001c', 'b0000000-0000-4000-8000-00000000000b', now() + interval '88 days', 'open', now() - interval '111 days'),
  ('d0000000-0000-4000-8000-00000000001d', 'b0000000-0000-4000-8000-00000000000d', now() + interval '88 days', 'open', now() - interval '506 days'),
  ('d0000000-0000-4000-8000-00000000001e', 'b0000000-0000-4000-8000-00000000000d', now() + interval '33 days', 'open', now() - interval '434 days'),
  ('d0000000-0000-4000-8000-00000000001f', 'b0000000-0000-4000-8000-00000000000c', now() + interval '14 days', 'open', now() - interval '77 days'),
  ('d0000000-0000-4000-8000-000000000020', 'b0000000-0000-4000-8000-00000000000d', now() + interval '43 days', 'open', now() - interval '132 days'),
  ('d0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000d', now() + interval '21 days', 'open', now() - interval '510 days'),
  ('d0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-00000000000b', now() + interval '7 days', 'open', now() - interval '135 days'),
  ('d0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-00000000000d', now() + interval '73 days', 'open', now() - interval '75 days'),
  ('d0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000b', now() + interval '26 days', 'open', now() - interval '465 days'),
  ('d0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000e', now() + interval '89 days', 'open', now() - interval '277 days'),
  ('d0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-000000000010', now() + interval '89 days', 'open', now() - interval '475 days'),
  ('d0000000-0000-4000-8000-000000000027', 'b0000000-0000-4000-8000-000000000010', now() + interval '84 days', 'open', now() - interval '458 days'),
  ('d0000000-0000-4000-8000-000000000028', 'b0000000-0000-4000-8000-00000000000f', now() + interval '56 days', 'open', now() - interval '133 days'),
  ('d0000000-0000-4000-8000-000000000029', 'b0000000-0000-4000-8000-00000000000e', now() + interval '7 days', 'open', now() - interval '156 days'),
  ('d0000000-0000-4000-8000-00000000002a', 'b0000000-0000-4000-8000-000000000010', now() + interval '18 days', 'open', now() - interval '394 days'),
  ('d0000000-0000-4000-8000-00000000002b', 'b0000000-0000-4000-8000-00000000000f', now() + interval '13 days', 'open', now() - interval '355 days'),
  ('d0000000-0000-4000-8000-00000000002c', 'b0000000-0000-4000-8000-00000000000f', now() + interval '58 days', 'open', now() - interval '65 days'),
  ('d0000000-0000-4000-8000-00000000002d', 'b0000000-0000-4000-8000-000000000010', now() + interval '68 days', 'open', now() - interval '489 days'),
  ('d0000000-0000-4000-8000-00000000002e', 'b0000000-0000-4000-8000-00000000000e', now() + interval '44 days', 'open', now() - interval '504 days'),
  ('d0000000-0000-4000-8000-00000000002f', 'b0000000-0000-4000-8000-000000000012', now() + interval '87 days', 'open', now() - interval '127 days'),
  ('d0000000-0000-4000-8000-000000000030', 'b0000000-0000-4000-8000-000000000013', now() + interval '89 days', 'open', now() - interval '546 days'),
  ('d0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-000000000011', now() + interval '84 days', 'open', now() - interval '70 days'),
  ('d0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-000000000011', now() + interval '67 days', 'open', now() - interval '246 days'),
  ('d0000000-0000-4000-8000-000000000033', 'b0000000-0000-4000-8000-000000000011', now() + interval '14 days', 'open', now() - interval '361 days'),
  ('d0000000-0000-4000-8000-000000000034', 'b0000000-0000-4000-8000-000000000012', now() + interval '72 days', 'open', now() - interval '517 days'),
  ('d0000000-0000-4000-8000-000000000035', 'b0000000-0000-4000-8000-000000000013', now() + interval '31 days', 'open', now() - interval '556 days'),
  ('d0000000-0000-4000-8000-000000000036', 'b0000000-0000-4000-8000-000000000011', now() + interval '74 days', 'open', now() - interval '456 days'),
  ('d0000000-0000-4000-8000-000000000037', 'b0000000-0000-4000-8000-000000000013', now() + interval '76 days', 'open', now() - interval '47 days'),
  ('d0000000-0000-4000-8000-000000000038', 'b0000000-0000-4000-8000-000000000016', now() + interval '86 days', 'open', now() - interval '532 days'),
  ('d0000000-0000-4000-8000-000000000039', 'b0000000-0000-4000-8000-000000000015', now() + interval '84 days', 'open', now() - interval '154 days'),
  ('d0000000-0000-4000-8000-00000000003a', 'b0000000-0000-4000-8000-000000000014', now() + interval '89 days', 'open', now() - interval '104 days'),
  ('d0000000-0000-4000-8000-00000000003b', 'b0000000-0000-4000-8000-000000000015', now() + interval '71 days', 'open', now() - interval '199 days'),
  ('d0000000-0000-4000-8000-00000000003c', 'b0000000-0000-4000-8000-000000000014', now() + interval '62 days', 'open', now() - interval '401 days'),
  ('d0000000-0000-4000-8000-00000000003d', 'b0000000-0000-4000-8000-000000000014', now() + interval '26 days', 'open', now() - interval '456 days'),
  ('d0000000-0000-4000-8000-00000000003e', 'b0000000-0000-4000-8000-000000000014', now() + interval '24 days', 'open', now() - interval '330 days'),
  ('d0000000-0000-4000-8000-00000000003f', 'b0000000-0000-4000-8000-000000000014', now() + interval '47 days', 'open', now() - interval '527 days'),
  ('d0000000-0000-4000-8000-000000000040', 'b0000000-0000-4000-8000-000000000014', now() + interval '32 days', 'open', now() - interval '461 days'),
  ('d0000000-0000-4000-8000-000000000041', 'b0000000-0000-4000-8000-000000000016', now() + interval '81 days', 'open', now() - interval '161 days'),
  ('d0000000-0000-4000-8000-000000000042', 'b0000000-0000-4000-8000-000000000019', now() + interval '85 days', 'open', now() - interval '465 days'),
  ('d0000000-0000-4000-8000-000000000043', 'b0000000-0000-4000-8000-000000000018', now() + interval '88 days', 'open', now() - interval '76 days'),
  ('d0000000-0000-4000-8000-000000000044', 'b0000000-0000-4000-8000-000000000018', now() + interval '89 days', 'open', now() - interval '245 days'),
  ('d0000000-0000-4000-8000-000000000045', 'b0000000-0000-4000-8000-000000000017', now() + interval '44 days', 'open', now() - interval '266 days'),
  ('d0000000-0000-4000-8000-000000000046', 'b0000000-0000-4000-8000-000000000019', now() + interval '13 days', 'open', now() - interval '451 days'),
  ('d0000000-0000-4000-8000-000000000047', 'b0000000-0000-4000-8000-000000000018', now() + interval '75 days', 'open', now() - interval '360 days'),
  ('d0000000-0000-4000-8000-000000000048', 'b0000000-0000-4000-8000-000000000018', now() + interval '16 days', 'open', now() - interval '258 days'),
  ('d0000000-0000-4000-8000-000000000049', 'b0000000-0000-4000-8000-000000000017', now() + interval '30 days', 'open', now() - interval '227 days'),
  ('d0000000-0000-4000-8000-00000000004a', 'b0000000-0000-4000-8000-000000000019', now() + interval '33 days', 'open', now() - interval '150 days'),
  ('d0000000-0000-4000-8000-00000000004b', 'b0000000-0000-4000-8000-000000000019', now() + interval '7 days', 'open', now() - interval '107 days'),
  ('d0000000-0000-4000-8000-00000000004c', 'b0000000-0000-4000-8000-00000000001c', now() + interval '89 days', 'open', now() - interval '325 days'),
  ('d0000000-0000-4000-8000-00000000004d', 'b0000000-0000-4000-8000-00000000001b', now() + interval '86 days', 'open', now() - interval '169 days'),
  ('d0000000-0000-4000-8000-00000000004e', 'b0000000-0000-4000-8000-00000000001b', now() + interval '84 days', 'open', now() - interval '529 days'),
  ('d0000000-0000-4000-8000-00000000004f', 'b0000000-0000-4000-8000-00000000001a', now() + interval '45 days', 'open', now() - interval '46 days'),
  ('d0000000-0000-4000-8000-000000000050', 'b0000000-0000-4000-8000-00000000001b', now() + interval '29 days', 'open', now() - interval '467 days'),
  ('d0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000001c', now() + interval '14 days', 'open', now() - interval '324 days'),
  ('d0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000001a', now() + interval '42 days', 'open', now() - interval '261 days'),
  ('d0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000001c', now() + interval '63 days', 'open', now() - interval '401 days'),
  ('d0000000-0000-4000-8000-000000000054', 'b0000000-0000-4000-8000-00000000001c', now() + interval '46 days', 'open', now() - interval '86 days'),
  ('d0000000-0000-4000-8000-000000000055', 'b0000000-0000-4000-8000-00000000001c', now() + interval '8 days', 'open', now() - interval '314 days')
on conflict do nothing;
