-- 0011: 表示名の漏れ・公開プロフィール・掲載停止リスト（docs/SPEC.md §9.18）
--
--   1. メールアドレス由来の表示名をやめる
--      - ログイン時のプロフィール行は ensure_user_profile() が作る（初期値「地元の人」）。
--      - 既存の利用者で、表示名がメールアドレスの @ 前と同じ行を「地元の人」に置き換える。
--      - 表示名の変更は set_display_name(p_name) だけ（1〜20文字・改行や制御文字なし・メールアドレスの形なし）。
--   2. 公開プロフィールを絞る
--      - public_profiles から avatar_url を外す（area_name / resident_years は署名に使うので残す）。
--      - authenticated から users への直接の INSERT / UPDATE 権限をすべて外す
--        （avatar_url・area_name・resident_years は画面から設定できない。表示名は 1. の RPC だけ）。
--   3. 掲載停止リスト
--      - removed_places（運営だけが読み書きする）と店名の正規化 normalize_place_name(text)。
--      - create_spot（0006）を置き換え、正規化した店名が一致し、かつ 100m 以内に記録があれば拒否する。
--      - どの経路でも、掲載停止の店を published にしない（spots のトリガー）。
--      - remove_place(p_spot_id, p_note)（service_role のみ）: スポットを expired にし、記録する。

-- =========================================================
-- 1. 表示名
-- =========================================================

-- 1-1. 既存の利用者: 表示名がメールアドレスの @ 前と同じ行を「地元の人」に置き換える。
--      auth スキーマを読むのはこの関数（マイグレーションで1回呼ぶ）だけ。誰にも EXECUTE を与えない。
create or replace function public.replace_email_derived_display_names()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.users u
  set display_name = '地元の人'
  from auth.users a
  where a.id = u.id
    and a.email is not null
    and position('@' in a.email) > 1
    and u.display_name = split_part(a.email, '@', 1);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.replace_email_derived_display_names() is
  'SPEC §9.18-1: 表示名がメールアドレスの @ 前と同じ既存の行を「地元の人」に置き換え、件数を返す。マイグレーション専用。';

select public.replace_email_derived_display_names();

-- 1-2. ログイン時のプロフィール行の作成（/auth/callback から呼ぶ）。初期値は「地元の人」。既にあれば何もしない。
create or replace function public.ensure_user_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  insert into public.users (id, display_name)
  values (v_uid, '地元の人')
  on conflict (id) do nothing;
end;
$$;

comment on function public.ensure_user_profile() is
  'SPEC §9.18-1: 本人のプロフィール行を表示名「地元の人」で作る（あれば何もしない）。メールアドレスの一部は使わない。';

-- 1-3. 表示名の変更。前後の空白（全角空白・改行を含む）を除いて検査し、保存した名前を返す。
--      文言は src/lib/domain/display-name.ts と同じ。
create or replace function public.set_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  v_name := pg_catalog.regexp_replace(coalesce(p_name, ''), '^[[:space:]　]+|[[:space:]　]+$', '', 'g');

  if char_length(v_name) = 0 then
    raise exception '表示名を入力してください' using errcode = '22023';
  end if;
  if char_length(v_name) > 20 then
    raise exception '表示名は20文字以内で入力してください' using errcode = '22023';
  end if;
  if v_name ~ '[\u0001-\u001f\u007f-\u009f  ]' then
    raise exception '表示名に改行や制御文字は使えません' using errcode = '22023';
  end if;
  if v_name ~ '[^[:space:]@＠][@＠][^[:space:]@＠]' then
    raise exception '表示名にメールアドレスは使えません' using errcode = '22023';
  end if;

  update public.users set display_name = v_name where id = v_uid;
  if not found then
    raise exception 'プロフィールが見つかりませんでした' using errcode = 'P0002';
  end if;

  return v_name;
end;
$$;

comment on function public.set_display_name(text) is
  'SPEC §9.18-1: 本人の表示名を変える（1〜20文字・改行や制御文字なし・メールアドレスの形なし）。保存した名前を返す。';

-- =========================================================
-- 2. 公開プロフィールと users の権限
-- =========================================================

-- 2-1. public_profiles から avatar_url を外す（0006 の定義から列だけを変える。行の絞り込みは同じ）。
drop view if exists public.public_profiles;
create view public.public_profiles
  with (security_barrier = true)
as
  select u.id, u.display_name, u.area_name, u.resident_years
  from public.users u
  where public.is_profile_visible(u.id);

comment on view public.public_profiles is
  '投稿者クレジット表示用（SPEC §9.13.6・§9.18-2）。id, display_name, area_name, resident_years のみ。本人・公開中スポットの投稿者・呼び出し者が読める pending スポットの投稿者だけ。';

revoke all on table public.public_profiles from public, anon, authenticated, service_role;
grant select on table public.public_profiles to anon, authenticated, service_role;

-- 2-2. users への直接の書き込みをやめる。行の作成は ensure_user_profile、表示名は set_display_name、
--      住んでいる街は set_home_city / initialize_home_city（0007）だけ。
revoke insert, update on table public.users from authenticated;
revoke insert (id, display_name, avatar_url, home_city_id, resident_years) on table public.users from authenticated;
revoke update (display_name, avatar_url, home_city_id, resident_years) on table public.users from authenticated;

-- 2-3. 誰がどの店を承認したか（endorsements.user_id）は公開しない。画面は承認の件数（spot_id）しか使わない。
--      表単位の SELECT を外し、user_id 以外の列だけを読めるようにする（行の範囲は 0006 の RLS のまま）。
--      承認の記録・重複の判定は DB 関数 endorse_spot（security definer）が行うので影響しない。
revoke select on table public.endorsements from anon, authenticated;
grant select (id, spot_id, created_at) on table public.endorsements to anon, authenticated;

-- =========================================================
-- 3. 掲載停止リスト
-- =========================================================

-- 3-1. 店名の正規化: NFKC（全角英数→半角、半角カナ→全角）→ 小文字 → 空白・中黒・句読点・括弧・ハイフンなどを除く。
--      長音記号「ー」は店名の一部なので残す。
create or replace function public.normalize_place_name(p_name text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(pg_catalog.normalize(p_name, 'NFKC')),
    '[[:space:]・·.,、。‐‑‒–—―−_''’‘"“”!?()「」『』【】&/~〜-]',
    '',
    'g'
  );
$$;

comment on function public.normalize_place_name(text) is
  'SPEC §9.18-3: 掲載停止リストと照合するための店名の正規化（全角半角・大文字小文字・空白・中黒・記号を揃える）。';

-- 3-2. 表 removed_places。運営が Supabase の画面（または remove_place）で行を足す。
create table if not exists public.removed_places (
  id uuid primary key default gen_random_uuid(),
  name_normalized text not null check (char_length(name_normalized) > 0),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  removed_at timestamptz not null default now(),
  note text
);

comment on table public.removed_places is
  'SPEC §9.18-3: 掲載停止リスト。正規化した店名が一致し、かつ 100m 以内の投稿・公開を拒否する。運営（service_role）だけが読み書きする。';

create index if not exists removed_places_name_normalized_idx on public.removed_places (name_normalized);

alter table public.removed_places enable row level security;
-- ポリシーは作らない（anon / authenticated には表の権限も与えない）。
revoke all on table public.removed_places from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.removed_places to service_role;

-- 運営が画面から店名をそのまま入れても照合できるよう、保存時に正規化する。
create or replace function public.normalize_removed_place_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name_normalized := public.normalize_place_name(new.name_normalized);
  return new;
end;
$$;

drop trigger if exists removed_places_normalize_name on public.removed_places;
create trigger removed_places_normalize_name
  before insert or update of name_normalized on public.removed_places
  for each row execute function public.normalize_removed_place_name();

-- 3-3. PostGIS を使う関数（掲載停止の照合・create_spot の置き換え・公開の阻止・remove_place）。
--      0006 と同じく、PostGIS の関数・型は実際に入っているスキーマで修飾する（§9.13.8）。
do $migration$
declare
  v_postgis_schema text;
begin
  select n.nspname
  into v_postgis_schema
  from pg_catalog.pg_extension e
  join pg_catalog.pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'postgis';

  if v_postgis_schema is null then
    raise exception 'PostGIS 拡張が見つかりません（0001_init.sql で create extension postgis が必要です）';
  end if;

  -- 掲載停止の記録があるか（正規化した店名が一致し、かつ 100m 以内）。内部関数（誰にも EXECUTE を与えない）。
  execute format($definition$
create or replace function public.is_place_removed(
  p_name text,
  p_lat double precision,
  p_lng double precision
) returns boolean
language sql
stable
security definer
set search_path = ''
as $body$
  select exists (
    select 1
    from public.removed_places r
    where r.name_normalized = public.normalize_place_name(p_name)
      and %1$I.st_dwithin(
        %1$I.st_setsrid(%1$I.st_makepoint(r.lng, r.lat), 4326)::%1$I.geography,
        %1$I.st_setsrid(%1$I.st_makepoint(p_lng, p_lat), 4326)::%1$I.geography,
        100
      )
  );
$body$;
$definition$, v_postgis_schema);

  -- create_spot（0006 の定義）に掲載停止の照合を足す。既存の検査・順序はそのまま。
  execute format($definition$
create or replace function public.create_spot(
  p_city_id uuid,
  p_name text,
  p_reason text,
  p_lat double precision,
  p_lng double precision,
  p_visit_frequency text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_uid uuid := auth.uid();
  v_home_city_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_spot_id uuid;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select u.home_city_id into v_home_city_id from public.users u where u.id = v_uid;
  if v_home_city_id is null or v_home_city_id <> p_city_id then
    raise exception '住んでいる街にだけピンを立てられます' using errcode = '42501';
  end if;

  if char_length(v_name) = 0 or char_length(v_name) > 80 then
    raise exception '店の名前は80字以内で入力してください' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 or char_length(p_reason) > 60 then
    raise exception 'なぜここへ行くのかを60字以内で入力してください' using errcode = '22023';
  end if;
  if p_visit_frequency is null or p_visit_frequency not in ('weekly', 'monthly', 'yearly') then
    raise exception '行く頻度を選んでください' using errcode = '22023';
  end if;
  if p_lat is null or p_lng is null
     or p_lat < -90 or p_lat > 90
     or p_lng < -180 or p_lng > 180 then
    raise exception '場所を選んでください' using errcode = '22023';
  end if;

  -- SPEC §9.18-3: 掲載停止の店（正規化した店名が一致し、かつ 100m 以内）は受け付けない。
  if public.is_place_removed(v_name, p_lat, p_lng) then
    raise exception 'この店は掲載を控えています。' using errcode = '42501';
  end if;

  insert into public.spots (city_id, name, reason, visit_frequency, location, author_id, status, quietness)
  values (
    p_city_id,
    v_name,
    p_reason,
    p_visit_frequency,
    %1$I.st_setsrid(%1$I.st_makepoint(p_lng, p_lat), 4326)::%1$I.geography,
    v_uid,
    'pending',
    'quiet'
  )
  returning id into v_spot_id;

  return v_spot_id;
end;
$body$;
$definition$, v_postgis_schema);

  -- どの経路（承認での公開・dormant からの復帰・運営の直接更新）でも、掲載停止の店を published にしない。
  execute format($definition$
create or replace function public.block_removed_place_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $body$
begin
  if public.is_place_removed(
    new.name,
    %1$I.st_y(new.location::%1$I.geometry),
    %1$I.st_x(new.location::%1$I.geometry)
  ) then
    raise exception 'この店は掲載を控えています。' using errcode = '42501';
  end if;
  return new;
end;
$body$;
$definition$, v_postgis_schema);

  -- 運営が店を外す。スポットを expired（地図・一覧・承認待ちのどれにも出ない）にし、掲載停止リストに記録する。
  -- dormant は確認への回答で published に戻るため使わない。open の確認依頼は missed にして閉じる。
  execute format($definition$
create or replace function public.remove_place(p_spot_id uuid, p_note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $body$
declare
  v_name text;
  v_lat double precision;
  v_lng double precision;
  v_removed_id uuid;
begin
  select s.name,
         %1$I.st_y(s.location::%1$I.geometry),
         %1$I.st_x(s.location::%1$I.geometry)
  into v_name, v_lat, v_lng
  from public.spots s
  where s.id = p_spot_id
  for update;

  if not found then
    raise exception 'スポットが見つかりません' using errcode = 'P0002';
  end if;

  insert into public.removed_places (name_normalized, lat, lng, note)
  values (v_name, v_lat, v_lng, nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_removed_id;

  update public.spots set status = 'expired' where id = p_spot_id;

  update public.verification_requests
  set status = 'missed'
  where spot_id = p_spot_id
    and status = 'open';

  return v_removed_id;
end;
$body$;
$definition$, v_postgis_schema);
end;
$migration$;

comment on function public.is_place_removed(text, double precision, double precision) is
  'SPEC §9.18-3: 正規化した店名が一致し、かつ 100m 以内に掲載停止の記録があるか。内部関数。';
comment on function public.remove_place(uuid, text) is
  'SPEC §9.18-3: 運営がスポットを外す（expired にして removed_places に記録。open の確認依頼は missed）。service_role のみ。';

drop trigger if exists spots_block_removed_place_publish on public.spots;
create trigger spots_block_removed_place_publish
  before insert or update of status on public.spots
  for each row
  when (new.status = 'published')
  execute function public.block_removed_place_publish();

-- =========================================================
-- 4. 関数の EXECUTE
--   ensure_user_profile / set_display_name: authenticated のみ
--   remove_place: service_role のみ
--   replace_email_derived_display_names / normalize_place_name / is_place_removed / トリガー関数: 誰にも与えない
-- =========================================================
revoke all on function public.replace_email_derived_display_names() from public, anon, authenticated, service_role;
revoke all on function public.ensure_user_profile() from public, anon, authenticated, service_role;
revoke all on function public.set_display_name(text) from public, anon, authenticated, service_role;
revoke all on function public.normalize_place_name(text) from public, anon, authenticated, service_role;
revoke all on function public.normalize_removed_place_name() from public, anon, authenticated, service_role;
revoke all on function public.is_place_removed(text, double precision, double precision) from public, anon, authenticated, service_role;
revoke all on function public.block_removed_place_publish() from public, anon, authenticated, service_role;
revoke all on function public.remove_place(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.create_spot(uuid, text, text, double precision, double precision, text) from public, anon, authenticated, service_role;

grant execute on function public.ensure_user_profile() to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.remove_place(uuid, text) to service_role;
grant execute on function public.create_spot(uuid, text, text, double precision, double precision, text) to authenticated;
