-- ウラスポ 初期スキーマ
-- Spec: docs/SPEC.md §3（データモデル）
-- PostGIS の geography(Point,4326) を位置情報に使う。

-- PostGIS 拡張（Supabase では extensions スキーマに入るのが既定だが、
-- ローカル/セルフホストでも動くよう schema 指定はせず素朴に有効化する）
create extension if not exists postgis;
create extension if not exists pgcrypto; -- gen_random_uuid() 用

-- =========================================================
-- cities: 街（札幌・小樽・函館・旭川・富良野・釧路・帯広・稚内）
-- =========================================================
create table if not exists cities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  name_kana text not null,
  is_port boolean not null default false,
  center_lat double precision not null,
  center_lng double precision not null,
  default_zoom numeric(4, 2) not null default 13,
  created_at timestamptz not null default now()
);

comment on table cities is '街。Spec §3 cities。';

-- =========================================================
-- users: Supabase Auth と 1:1（auth.users.id を主キーに使う）
-- =========================================================
create table if not exists users (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  home_city_id uuid references cities (id) on delete set null,
  area_name text,
  resident_years integer,
  avatar_url text,
  lantern_points integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table users is 'アプリ内プロフィール。auth.users と1:1（Task6 が認証結線時に行を作成する）。';

-- =========================================================
-- tags: 魚屋直営／昼が本番／現金のみ／ひとりで入れる 等
-- =========================================================
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  label text not null,
  kind text not null check (kind in ('accent', 'accent2', 'neutral', 'outline')),
  created_at timestamptz not null default now()
);

-- =========================================================
-- spots: 店（ピン）
-- =========================================================
create table if not exists spots (
  id uuid primary key default gen_random_uuid(),
  city_id uuid not null references cities (id) on delete cascade,
  name text not null,
  address text,
  area_name text,
  category text,
  -- 緯度経度は PostGIS の geography(Point,4326) で持つ。
  -- lat/lng は生成列として複製し、アプリ側の単純な読み取り・既存インデックスの両方に使う。
  location geography(Point, 4326) not null,
  lat double precision generated always as (st_y(location::geometry)) stored,
  lng double precision generated always as (st_x(location::geometry)) stored,
  status text not null default 'pending'
    check (status in ('pending', 'published', 'dormant', 'expired')),
  quietness text not null default 'quiet'
    check (quietness in ('quiet', 'crowding', 'touristy')),
  reason text not null check (char_length(reason) <= 60),
  visit_frequency text not null
    check (visit_frequency in ('weekly', 'monthly', 'yearly')),
  author_id uuid not null references users (id) on delete cascade,
  photo_url text,
  published_at timestamptz,
  next_verification_at timestamptz,
  last_verified_at timestamptz,
  created_at timestamptz not null default now()
);

comment on column spots.reason is 'なぜ自分はここへ行くのか。60字まで（Spec S5）。';
comment on column spots.location is 'geography(Point,4326)。lat/lng は生成列として複製。';

-- Spec PLAN Task2: インデックス（spots(city_id, status)、位置のGIST）
create index if not exists spots_city_status_idx on spots (city_id, status);
create index if not exists spots_location_gix on spots using gist (location);
create index if not exists spots_status_idx on spots (status);
create index if not exists spots_author_idx on spots (author_id);

-- =========================================================
-- spot_tags: spots <-> tags の中間テーブル
-- =========================================================
create table if not exists spot_tags (
  spot_id uuid not null references spots (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (spot_id, tag_id)
);

create index if not exists spot_tags_tag_idx on spot_tags (tag_id);

-- =========================================================
-- endorsements: 「行ったことがある」承認（pending → published の条件）
-- =========================================================
create table if not exists endorsements (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references spots (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (spot_id, user_id)
);

create index if not exists endorsements_spot_idx on endorsements (spot_id);

-- =========================================================
-- verifications: 90日ごとの確認回答
-- =========================================================
create table if not exists verifications (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references spots (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  answer text not null check (answer in ('quiet', 'crowding', 'touristy')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists verifications_spot_idx on verifications (spot_id, created_at desc);
create index if not exists verifications_user_idx on verifications (user_id);

-- =========================================================
-- verification_requests: 90日ごとに投稿者へ届く確認依頼（Spec §2.3）
-- =========================================================
create table if not exists verification_requests (
  id uuid primary key default gen_random_uuid(),
  spot_id uuid not null references spots (id) on delete cascade,
  user_id uuid not null references users (id) on delete cascade,
  due_at timestamptz not null,
  answered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists verification_requests_spot_idx on verification_requests (spot_id);
create index if not exists verification_requests_user_idx on verification_requests (user_id, answered_at);

-- =========================================================
-- bookmarks: 栞
-- =========================================================
create table if not exists bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  spot_id uuid not null references spots (id) on delete cascade,
  planned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, spot_id)
);

create index if not exists bookmarks_user_idx on bookmarks (user_id);

-- =========================================================
-- badges / user_badges: 灯りバッジの定義と取得記録
-- =========================================================
create table if not exists badges (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug in ('keeper', 'winter', 'port')),
  glyph text not null,
  label text not null
);

create table if not exists user_badges (
  user_id uuid not null references users (id) on delete cascade,
  badge_id uuid not null references badges (id) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);
