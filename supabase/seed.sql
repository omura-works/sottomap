-- そっとマップ シードデータ
-- Spec: docs/SPEC.md §7（実データ方針）
--
-- 実データ方針:
--   - 街8件・実在店6件の「店名・住所・エリア・カテゴリ」は公開情報（各店の公式サイト /
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
