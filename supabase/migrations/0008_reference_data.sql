-- 0008: 本番に必須の参照データ（街・タグ・バッジ）
-- Spec: docs/SPEC.md §7（実データ方針）／本番公開前指示書 R13-B §2（final-review-R13 重要4）
--
-- `supabase/seed.sql` はデモユーザー・架空の確認履歴を含むため本番に流してはいけない
-- （docs/DEPLOY.md §3）。しかし cities（街）・tags（タグ）・badges（バッジ）は
-- 実店舗・実在の利用者を含まないアプリの設定データであり、`/start` を含む全画面が前提とする
-- 本番必須データのため、マイグレーションとして冪等に投入する。
--
-- IDは supabase/seed.sql と同じ固定値を使う（既存のテスト・フィクスチャ・E2Eと矛盾しないため）。
-- `on conflict` は各テーブルの一意制約に合わせる（cities.id / tags.id / badges.id は主キー、
-- slug にも unique 制約があるが、ここでは id を固定値にしているため id で衝突判定する）。

-- =========================================================
-- 1. cities（街8件）
-- =========================================================
insert into cities (id, slug, name, name_kana, is_port, center_lat, center_lng, default_zoom, featured_area) values
  ('a0000000-0000-4000-8000-000000000001', 'sapporo',   '札幌', 'さっぽろ', false, 43.0621, 141.3544, 12.5, '北24条'),
  ('a0000000-0000-4000-8000-000000000002', 'otaru',     '小樽', 'おたる',   true,  43.1907, 140.9947, 13.5, '色内'),
  ('a0000000-0000-4000-8000-000000000003', 'hakodate',  '函館', 'はこだて', true,  41.7687, 140.7288, 13.5, null),
  ('a0000000-0000-4000-8000-000000000004', 'asahikawa', '旭川', 'あさひかわ', false, 43.7706, 142.3649, 13, null),
  ('a0000000-0000-4000-8000-000000000005', 'furano',    '富良野', 'ふらの', false, 43.3416, 142.3831, 13, null),
  ('a0000000-0000-4000-8000-000000000006', 'kushiro',   '釧路', 'くしろ', true,  42.9849, 144.3820, 13, null),
  ('a0000000-0000-4000-8000-000000000007', 'obihiro',   '帯広', 'おびひろ', false, 42.9238, 143.1968, 13, null),
  ('a0000000-0000-4000-8000-000000000008', 'wakkanai',  '稚内', 'わっかない', true, 45.4155, 141.6733, 13.5, null)
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  name_kana = excluded.name_kana,
  is_port = excluded.is_port,
  center_lat = excluded.center_lat,
  center_lng = excluded.center_lng,
  default_zoom = excluded.default_zoom,
  featured_area = excluded.featured_area;

-- =========================================================
-- 2. tags
-- =========================================================
insert into tags (id, slug, label, kind) values
  ('e0000000-0000-4000-8000-000000000001', 'fish-shop-direct', '魚屋直営', 'accent2'),
  ('e0000000-0000-4000-8000-000000000002', 'takeout-ok', '持ち帰りもできる', 'neutral'),
  ('e0000000-0000-4000-8000-000000000003', 'night-only', '夜が本番', 'accent2'),
  ('e0000000-0000-4000-8000-000000000004', 'locals-market', '地元が買いに行く市場', 'accent2'),
  ('e0000000-0000-4000-8000-000000000005', 'morning-only', '朝のうちに', 'accent2'),
  ('e0000000-0000-4000-8000-000000000006', 'day-only', '昼だけ', 'accent2'),
  ('e0000000-0000-4000-8000-000000000007', 'cash-only', '現金のみ', 'neutral'),
  ('e0000000-0000-4000-8000-000000000008', 'solo-ok', 'ひとりで入れる', 'neutral'),
  ('e0000000-0000-4000-8000-000000000009', 'day-time-main', '昼が本番', 'neutral'),
  ('e0000000-0000-4000-8000-00000000000a', 'two-locations-in-city', '市内2店舗', 'outline')
on conflict (id) do update set
  slug = excluded.slug,
  label = excluded.label,
  kind = excluded.kind;

-- =========================================================
-- 3. badges
-- =========================================================
insert into badges (id, slug, glyph, label) values
  ('f0000000-0000-4000-8000-000000000001', 'keeper', '灯', '番人'),
  ('f0000000-0000-4000-8000-000000000002', 'winter', '雪', '冬も歩いた'),
  ('f0000000-0000-4000-8000-000000000003', 'port',   '港', '港')
on conflict (id) do update set
  slug = excluded.slug,
  glyph = excluded.glyph,
  label = excluded.label;
