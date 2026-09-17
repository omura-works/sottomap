-- ウラスポ 安全性と整合性の強化（docs/SPEC.md §9.13。2026-09-14 最終レビュー領域A、2026-09-16 再レビューの裁定）
--
-- 原則: 状態・時刻・ポイントを変える書き込みは、利用者に直接させない。
--       DB 関数（security definer）に集約し、対象行をロックしたうえで DB が条件を再検査する。
--
-- 【適用の前提】空のDB（新規プロジェクト）に 0001〜0006 を順に適用する前提で書いている（SPEC §9.13.8）。
--   既存データがある DB に適用する場合は、ポイント残高（users.lantern_points）・確認履歴（verifications）・
--   承認時刻（endorsements.created_at）を監査し、台帳（lantern_events）と整合するよう調整してから使うこと。
--
-- 0001〜0005 は書き換えない。このマイグレーションで次を行う。
--   1. ポイント台帳 lantern_events（unique (kind, source_id)）
--   2. verifications.verification_request_id（verification_requests への FK・一意）
--   3. 読み取り範囲（RLS）と表示用ビュー public_profiles（§9.13.6）
--   4. DB 関数 create_spot / endorse_spot / answer_verification / run_verification_cron と内部関数
--   5. 権限の明示（§9.13.8）: public スキーマの全オブジェクトを anon / authenticated / PUBLIC から一度取り上げ、
--      必要なものだけ付け直す。既定権限（Supabase の自動 GRANT）には頼らない。
--
-- DB 関数の書き方（§9.13.8）:
--   - すべて `set search_path = ''`。名前はすべてスキーマ修飾する（public.spots、auth.uid()）。
--     now / count / coalesce / jsonb_build_object などの組み込みは pg_catalog にあり、常に解決される。
--   - PostGIS は、このマイグレーションの実行時に pg_extension.extnamespace で実際のスキーマを調べて修飾する。
--
-- 時刻の規則（すべて DB の now() ＝各トランザクションの開始時刻を使う。利用者は時刻を指定できない）:
--   - pending の期限: created_at + 30日（絶対時刻）。now >= 期限 で expired。
--     ただし期限までに（同時刻を含む）2人の承認が成立していれば公開を優先する（§9.7・§9.13.5）。
--   - 確認に回答できる: open かつ due_at <= now。または dormant のスポットの最新の missed に1回だけ（§9.13.3）。
--   - missed: open かつ now >= due_at + 90日。
--   - 次の依頼の due_at: 公開・回答の時点 + 90日。
--
-- 行ロックの順序（デッドロック回避）:
--   - 利用者向けの関数は「spots の行 → verification_requests の行 → users の行（ポイント加算）」の順。
--     1回の呼び出しでロックするスポットは1件だけ。
--   - run_verification_cron は最初に勧告ロックを取り（cron 同士を直列化）、スポット行は
--     `for update skip locked` で取る。ロック中のスポットは待たずに次回へ回すので、
--     「cron がスポットP＋投稿者を保持したままスポットQを待つ」交差デッドロックが起きない（§9.13.8）。

-- =========================================================
-- 1. ポイント台帳（§9.13.4）
--    確認: kind='verification', source_id = verification_requests.id
--    公開: kind='publish',      source_id = spots.id
-- =========================================================
create table if not exists public.lantern_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null check (kind in ('verification', 'publish')),
  source_id uuid not null,
  points integer not null check (points > 0),
  created_at timestamptz not null default now(),
  constraint lantern_events_kind_source_unique unique (kind, source_id)
);

create index if not exists lantern_events_user_idx on public.lantern_events (user_id, created_at desc);

comment on table public.lantern_events is
  '灯りポイントの台帳（SPEC §9.13.4）。(kind, source_id) につき一度だけ記録し、同じトランザクションで users.lantern_points を加算する。';

alter table public.lantern_events enable row level security;

-- =========================================================
-- 2. verifications.verification_request_id（§9.13.2）
--    依頼を経由しない回答を不可能にする（書き込みは answer_verification だけが行う）。
--    seed のデータは依頼に紐づかないことがあるため NULL を許す（NULL は一意制約の対象外）。
--    新しい行は answer_verification が必ず依頼IDを入れる。
-- =========================================================
alter table public.verifications
  add column if not exists verification_request_id uuid
    references public.verification_requests (id) on delete set null;

create unique index if not exists verifications_verification_request_id_key
  on public.verifications (verification_request_id);

-- 回答済み依頼（answered_verification_id）から逆向きの紐づけを埋める（空のDBでは0件）。
-- 1つの回答に複数の依頼が紐づく異常データがあっても一意制約に反しないよう、最も古い依頼だけを採る。
update public.verifications v
set verification_request_id = src.request_id
from (
  select distinct on (vr.answered_verification_id)
    vr.answered_verification_id as verification_id,
    vr.id as request_id
  from public.verification_requests vr
  where vr.answered_verification_id is not null
  order by vr.answered_verification_id, vr.created_at, vr.id
) src
where v.id = src.verification_id
  and v.verification_request_id is null
  and not exists (
    select 1 from public.verifications other where other.verification_request_id = src.request_id
  );

-- =========================================================
-- 3. 読み取り範囲（RLS）と表示用ビュー
--    権限（GRANT / REVOKE）は最後の 5. でまとめて行う。
-- =========================================================

-- 3-1. 直接書き込みは 5. で取り上げるので、直接書き込み用のポリシーも削除する（残すと誤解を招く）
drop policy if exists spots_insert_own on public.spots;
drop policy if exists endorsements_insert_self_same_city_not_own_spot on public.endorsements;
drop policy if exists verifications_insert_spot_author_only on public.verifications;

-- 3-2. lantern_events: 本人の行だけ読める。書き込みは DB 関数だけ。
drop policy if exists lantern_events_select_self on public.lantern_events;
create policy lantern_events_select_self on public.lantern_events
  for select to authenticated
  using (user_id = auth.uid());

-- 3-3. users: 全列の select は本人のみ（§9.13.6）。
--      利用者が書ける列（表示名・アバター・居住街・居住年数）は 5. の列単位 GRANT で決める（§9.13.4）。
drop policy if exists users_select_all on public.users;
drop policy if exists users_select_self on public.users;
create policy users_select_self on public.users
  for select
  using (id = auth.uid());

-- 3-4. プロフィールを見せてよい相手か（§9.13.6）。
--      本人 / 公開中のスポットの投稿者 / 呼び出し者の居住街にある pending スポットの投稿者 → true。
--      （最後の条件は spots の RLS「pending は投稿者本人と同じ街の住人だけ読める」と同じ範囲）
--      security definer: users / spots の RLS を通らずに判定する。返すのは真偽値だけ。
--      ビューとポリシーの中から呼ぶため、anon / authenticated に EXECUTE を与える（5. を参照）。
create or replace function public.is_profile_visible(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_user_id is not null
    and (
      p_user_id = auth.uid()
      or exists (
        select 1
        from public.spots s
        where s.author_id = p_user_id
          and s.status = 'published'
      )
      or exists (
        select 1
        from public.spots s
        join public.users viewer
          on viewer.id = auth.uid()
         and viewer.home_city_id = s.city_id
        where s.author_id = p_user_id
          and s.status = 'pending'
      )
    ),
    false
  );
$$;

comment on function public.is_profile_visible(uuid) is
  'public_profiles と user_badges の可視範囲（SPEC §9.13.6）。本人・公開中スポットの投稿者・呼び出し者が読める pending スポットの投稿者だけ true。';

-- 3-5. 投稿者クレジット表示用のビュー。表示用の5列だけを出し、行は is_profile_visible で絞る。
--      security_invoker を付けない（ビュー所有者の権限で users を読む）ので、行の絞り込みはビュー自身が行う。
--      security_barrier: 利用者の条件（漏えいしうる関数）が絞り込みより先に評価されないようにする。
drop view if exists public.public_profiles;
create view public.public_profiles
  with (security_barrier = true)
as
  select u.id, u.display_name, u.area_name, u.resident_years, u.avatar_url
  from public.users u
  where public.is_profile_visible(u.id);

comment on view public.public_profiles is
  '投稿者クレジット表示用（SPEC §9.13.6）。id, display_name, area_name, resident_years, avatar_url のみ。本人・公開中スポットの投稿者・呼び出し者が読める pending スポットの投稿者だけ。';

-- 3-6. user_badges: 本人、またはプロフィールを見せてよい相手のバッジだけ（§9.13.6。0002 の全件公開をやめる）
drop policy if exists user_badges_select_all on public.user_badges;
drop policy if exists user_badges_select_visible on public.user_badges;
create policy user_badges_select_visible on public.user_badges
  for select
  using (
    user_id = auth.uid()
    or public.is_profile_visible(user_id)
  );

-- 3-7. endorsements / verifications: 読めるスポットに紐づく行、または本人の行だけ（§9.13.6）。
--      「読めるスポット」は spots の RLS をそのまま使う（公開中は全員、pending は投稿者と同じ街の住人、
--      dormant / expired は投稿者本人）。サブクエリの spots には呼び出し者の RLS がかかる。
drop policy if exists endorsements_select_all on public.endorsements;
drop policy if exists endorsements_select_visible_or_own on public.endorsements;
create policy endorsements_select_visible_or_own on public.endorsements
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.spots s where s.id = endorsements.spot_id)
  );

drop policy if exists verifications_select_all on public.verifications;
drop policy if exists verifications_select_visible_or_own on public.verifications;
create policy verifications_select_visible_or_own on public.verifications
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from public.spots s where s.id = verifications.spot_id)
  );

-- verification_requests: 0002 の verification_requests_select_self（user_id = auth.uid()）のまま。本人宛てのみ。
-- spots / spot_tags / cities / tags / badges / bookmarks: 0002 のポリシーのまま。

-- =========================================================
-- 4. DB 関数
--    security definer の関数は所有者（マイグレーション実行ロール）の権限で動き、RLS を通らない。
--    そのため「誰が・どの行に・いつ」書けるかは、すべて関数の中で auth.uid() と now() を使って検査する。
-- =========================================================

-- 4-0. 内部用: 台帳に記録できたときだけポイントを加算する（同じ (kind, source_id) は二度と加算しない）
--      security invoker（呼び出し元の security definer 関数の所有者権限で動く）。利用者からは実行できない。
create or replace function public.award_lantern_points(
  p_user_id uuid,
  p_kind text,
  p_source_id uuid,
  p_points integer
) returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  insert into public.lantern_events (user_id, kind, source_id, points)
  values (p_user_id, p_kind, p_source_id, p_points)
  on conflict (kind, source_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 0;
  end if;

  update public.users
  set lantern_points = lantern_points + p_points
  where id = p_user_id;

  return p_points;
end;
$$;

-- 4-0'. 内部用: pending のスポットを公開する。呼び出し側が spots の行を for update でロック済みであること。
--       公開時刻・次の依頼（now + 90日）・公開 +10（published_at が初めて入るときだけ、台帳で一回きり）を
--       呼び出し側と同じトランザクションで行う。戻り値は「open な依頼を新しく作ったか」。
create or replace function public.publish_pending_spot(p_spot_id uuid, p_now timestamptz)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  v_author_id uuid;
  v_published_at timestamptz;
  v_created integer;
begin
  select s.author_id, s.published_at
  into v_author_id, v_published_at
  from public.spots s
  where s.id = p_spot_id;

  update public.spots
  set status = 'published',
      published_at = coalesce(published_at, p_now),
      next_verification_at = p_now + interval '90 days'
  where id = p_spot_id;

  insert into public.verification_requests (spot_id, user_id, due_at, status)
  values (p_spot_id, v_author_id, p_now + interval '90 days', 'open')
  on conflict (spot_id) where status = 'open' do nothing;
  get diagnostics v_created = row_count;

  if v_published_at is null then
    perform public.award_lantern_points(v_author_id, 'publish', p_spot_id, 10);
  end if;

  return v_created > 0;
end;
$$;

-- ---------------------------------------------------------
-- 4-1. create_spot: S5「ピンを立てる」
--   検査: ログイン済み / 投稿者の home_city_id と投稿先の街が一致（地元の人だけ）/ 入力の範囲。
--   DB が決める: author_id = auth.uid()、status = 'pending'、quietness = 'quiet'、時刻列（created_at = now()）。
--   PostGIS の関数・型は、実際に入っているスキーマで修飾する（§9.13.8）。
--   そのため関数定義はここで PostGIS のスキーマを調べてから動的に作る。PostGIS が無ければ失敗させる。
-- ---------------------------------------------------------
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
end;
$migration$;

-- ---------------------------------------------------------
-- 4-2. endorse_spot: 「行ったことがある」
--   スポット行をロックして検査: ログイン済み / 投稿者本人でない / 同じ街の住人 /
--   pending（※）/ 承認時刻（DB の now()）が期限（created_at + 30日）以前。重複は無視（冪等）。
--   期限までの承認が2人になったら、公開・published_at・次の依頼（now + 90日）・公開 +10 を同じトランザクションで。
--   ※ expired でも、この承認の DB 時刻が期限以前なら受け付ける。cron が期限直後に先にロックを取って
--     expired にした場合でも「2人目の承認の DB 時刻が期限前なら公開が勝つ」（§9.13.5）を守るため。
-- ---------------------------------------------------------
create or replace function public.endorse_spot(p_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_spot public.spots%rowtype;
  v_home_city_id uuid;
  v_deadline timestamptz;
  v_timely_count integer;
  v_status text;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into v_spot from public.spots s where s.id = p_spot_id for update;
  if not found then
    raise exception 'スポットが見つかりませんでした' using errcode = 'P0002';
  end if;

  if v_spot.author_id = v_uid then
    raise exception '自分の投稿には「行ったことがある」を押せません' using errcode = '42501';
  end if;

  select u.home_city_id into v_home_city_id from public.users u where u.id = v_uid;
  if v_home_city_id is null or v_home_city_id <> v_spot.city_id then
    raise exception '同じ街に住むユーザーのみ承認できます' using errcode = '42501';
  end if;

  if v_spot.status not in ('pending', 'expired') then
    raise exception 'このピンは承認を受け付けていません' using errcode = '22023';
  end if;

  v_deadline := v_spot.created_at + interval '30 days';
  if v_now > v_deadline then
    raise exception '承認の期限を過ぎています' using errcode = '22023';
  end if;

  -- created_at は列の既定値（now()）だけ。利用者は指定できない。
  insert into public.endorsements (spot_id, user_id)
  values (p_spot_id, v_uid)
  on conflict (spot_id, user_id) do nothing;

  select count(*) into v_timely_count
  from public.endorsements e
  where e.spot_id = p_spot_id
    and e.user_id <> v_spot.author_id
    and e.created_at <= v_deadline;

  if v_timely_count >= 2 then
    perform public.publish_pending_spot(p_spot_id, v_now);
    v_status := 'published';
  else
    v_status := v_spot.status;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'endorsementCount', v_timely_count,
    'published', v_status = 'published'
  );
end;
$$;

-- ---------------------------------------------------------
-- 4-3. answer_verification: S6「確認」回答
--   スポット行 → 依頼行の順にロックして検査（§9.13.3）:
--     - ログイン済み / 依頼が本人宛て（他人宛ては「見つからない」と同じ扱い）
--     - 既に answered なら受理しない（記録も加算もせず accepted=false を返す。§9.6 の再送）
--     - 通常: status = 'open' かつ due_at <= now（期限前は拒否）
--     - 復帰: スポットが dormant で、依頼がそのスポットの最新の missed（1回だけ。受理したら answered）
--   受理したら 1トランザクションで: verifications に1行（verification_request_id 付き）/ 依頼を answered /
--   スポットの quietness・last_verified_at・next_verification_at を更新 / dormant なら published に戻す /
--   次の依頼（now + 90日）/ 確認 +5（台帳で一回きり）。
-- ---------------------------------------------------------
create or replace function public.answer_verification(
  p_request_id uuid,
  p_answer text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_spot_id uuid;
  v_spot public.spots%rowtype;
  v_request public.verification_requests%rowtype;
  v_latest_missed_id uuid;
  v_verification_id uuid;
  v_new_status text;
  v_points integer;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  if p_answer is null or p_answer not in ('quiet', 'crowding', 'touristy') then
    raise exception '答えを選んでください' using errcode = '22023';
  end if;

  -- ロック順序を守るため、まず依頼からスポットIDだけを引き、スポット → 依頼の順にロックする。
  -- 他人宛ての依頼は「見つからない」と同じ扱いにする（存在の有無を漏らさない）。
  select vr.spot_id into v_spot_id
  from public.verification_requests vr
  where vr.id = p_request_id
    and vr.user_id = v_uid;
  if not found then
    raise exception '確認依頼が見つかりませんでした' using errcode = 'P0002';
  end if;

  select * into v_spot from public.spots s where s.id = v_spot_id for update;
  if not found then
    raise exception '対象スポットが見つかりませんでした' using errcode = 'P0002';
  end if;

  select * into v_request from public.verification_requests vr where vr.id = p_request_id for update;
  if not found then
    raise exception '確認依頼が見つかりませんでした' using errcode = 'P0002';
  end if;

  -- 念のためロック後にも本人宛てであることを再検査する
  if v_request.user_id <> v_uid then
    raise exception '確認依頼が見つかりませんでした' using errcode = 'P0002';
  end if;

  -- 同じ依頼は二度と受理しない（再送は何も変えずに返す）
  if v_request.status = 'answered' then
    return jsonb_build_object('accepted', false, 'pointsAwarded', 0, 'status', v_spot.status);
  end if;

  if v_request.status = 'open' then
    if v_request.due_at > v_now then
      raise exception 'この確認はまだ届いていません' using errcode = '22023';
    end if;
  elsif v_request.status = 'missed' then
    if v_spot.status <> 'dormant' then
      raise exception 'この確認依頼には、もう回答できません' using errcode = '22023';
    end if;
    select vr.id into v_latest_missed_id
    from public.verification_requests vr
    where vr.spot_id = v_spot.id
      and vr.status = 'missed'
    order by vr.due_at desc, vr.created_at desc, vr.id desc
    limit 1;
    if v_latest_missed_id is distinct from v_request.id then
      raise exception 'この確認依頼には、もう回答できません' using errcode = '22023';
    end if;
  else
    raise exception 'この確認依頼には、もう回答できません' using errcode = '22023';
  end if;

  insert into public.verifications (spot_id, user_id, answer, note, verification_request_id)
  values (v_spot.id, v_uid, p_answer, p_note, v_request.id)
  returning id into v_verification_id;

  update public.verification_requests
  set status = 'answered',
      answered_verification_id = v_verification_id
  where id = v_request.id;

  v_new_status := case when v_spot.status = 'dormant' then 'published' else v_spot.status end;

  update public.spots
  set quietness = p_answer,
      last_verified_at = v_now,
      next_verification_at = v_now + interval '90 days',
      status = v_new_status
  where id = v_spot.id;

  if v_new_status = 'published' then
    insert into public.verification_requests (spot_id, user_id, due_at, status)
    values (v_spot.id, v_spot.author_id, v_now + interval '90 days', 'open')
    on conflict (spot_id) where status = 'open' do nothing;
  end if;

  v_points := public.award_lantern_points(v_uid, 'verification', v_request.id, 5);

  return jsonb_build_object('accepted', true, 'pointsAwarded', v_points, 'status', v_new_status);
end;
$$;

-- ---------------------------------------------------------
-- 4-4. run_verification_cron: 期限処理（service_role 専用）
--   (a) pending: 期限（created_at + 30日）までの承認が2人以上なら公開（期限後の実行でも公開が勝つ）、
--       そうでなく now >= 期限なら expired。
--   (b) open かつ now >= due_at + 90日 → missed、スポットは dormant。
--   (c) published で open の依頼が無いスポットに依頼（now + 90日）を作る。
--   ロック（§9.13.8）:
--     - 最初に勧告ロック（トランザクション単位）を取り、cron 同士を直列化する
--       （2つの cron が別々の順で投稿者の users 行を更新してデッドロックするのを防ぐ）。
--     - スポット行は `for update skip locked` で取る。回答・承認がロック中のスポットは待たずに飛ばし、
--       skippedLockedCount に数える（次回の cron で処理する）。
--     - (b) は、スポットを取れたときだけ依頼を missed にする。
--   各スポットはロックしてから条件を再検査するので、承認・回答と同時に走っても二重に遷移しない。冪等。
-- ---------------------------------------------------------
create or replace function public.run_verification_cron()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_checked integer := 0;
  v_changed integer := 0;
  v_missed integer := 0;
  v_created integer := 0;
  v_skipped integer := 0;
  v_rows integer;
  v_timely_count integer;
  v_locked_id uuid;
  v_author_id uuid;
  v_created_at timestamptz;
  r record;
begin
  -- cron 同士の直列化（キーは固定値。ウラスポの cron 専用）
  perform pg_advisory_xact_lock(7426318110006001);

  select count(*) into v_checked from public.spots s where s.status in ('pending', 'published');

  -- (a) pending の期限処理
  for r in
    select s.id from public.spots s where s.status = 'pending' order by s.id
  loop
    select s.id, s.author_id, s.created_at
    into v_locked_id, v_author_id, v_created_at
    from public.spots s
    where s.id = r.id
      and s.status = 'pending'
    for update skip locked;

    if not found then
      -- 取れなかった理由が「ロック中」なら次回へ回す（状態が変わっただけなら数えない）
      if exists (select 1 from public.spots s where s.id = r.id and s.status = 'pending') then
        v_skipped := v_skipped + 1;
      end if;
      continue;
    end if;

    select count(*) into v_timely_count
    from public.endorsements e
    where e.spot_id = v_locked_id
      and e.user_id <> v_author_id
      and e.created_at <= v_created_at + interval '30 days';

    if v_timely_count >= 2 then
      if public.publish_pending_spot(v_locked_id, v_now) then
        v_created := v_created + 1;
        v_changed := v_changed + 1;
      end if;
      v_changed := v_changed + 1;
    elsif v_now >= v_created_at + interval '30 days' then
      update public.spots
      set status = 'expired'
      where id = v_locked_id
        and status = 'pending';
      get diagnostics v_rows = row_count;
      v_changed := v_changed + v_rows;
    end if;
  end loop;

  -- (b) missed → dormant（スポットを取れたときだけ依頼を missed にする）
  for r in
    select vr.id as request_id, vr.spot_id
    from public.verification_requests vr
    where vr.status = 'open'
      and v_now >= vr.due_at + interval '90 days'
    order by vr.spot_id, vr.id
  loop
    select s.id into v_locked_id
    from public.spots s
    where s.id = r.spot_id
    for update skip locked;

    if not found then
      if exists (select 1 from public.spots s where s.id = r.spot_id) then
        v_skipped := v_skipped + 1;
      end if;
      continue;
    end if;

    update public.verification_requests
    set status = 'missed'
    where id = r.request_id
      and status = 'open'
      and v_now >= due_at + interval '90 days';
    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      v_missed := v_missed + 1;
      v_changed := v_changed + 1;

      update public.spots set status = 'dormant' where id = v_locked_id and status = 'published';
      get diagnostics v_rows = row_count;
      v_changed := v_changed + v_rows;
    end if;
  end loop;

  -- (c) open の依頼が無い published スポットに次の依頼を作る
  for r in
    select s.id
    from public.spots s
    where s.status = 'published'
      and not exists (
        select 1 from public.verification_requests vr where vr.spot_id = s.id and vr.status = 'open'
      )
    order by s.id
  loop
    select s.id, s.author_id
    into v_locked_id, v_author_id
    from public.spots s
    where s.id = r.id
      and s.status = 'published'
    for update skip locked;

    if not found then
      if exists (select 1 from public.spots s where s.id = r.id and s.status = 'published') then
        v_skipped := v_skipped + 1;
      end if;
      continue;
    end if;

    insert into public.verification_requests (spot_id, user_id, due_at, status)
    values (v_locked_id, v_author_id, v_now + interval '90 days', 'open')
    on conflict (spot_id) where status = 'open' do nothing;
    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      update public.spots set next_verification_at = v_now + interval '90 days' where id = v_locked_id;
      v_created := v_created + 1;
      v_changed := v_changed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'changed', v_changed,
    'missedRequestCount', v_missed,
    'createdRequestCount', v_created,
    'skippedLockedCount', v_skipped
  );
end;
$$;

-- =========================================================
-- 5. 権限（§9.13.8）: 既定権限に頼らず明示する
-- =========================================================

-- 5-1. public スキーマへの CREATE は誰にも与えない（関数・型の差し替えを防ぐ）。USAGE は API の3ロールに明示。
revoke create on schema public from public, anon, authenticated;
grant usage on schema public to anon, authenticated, service_role;

-- 5-2. このアプリの全オブジェクト（表・ビュー・シーケンス・関数）から、PUBLIC / anon / authenticated /
--      service_role の権限を一度すべて取り上げる。
--      拡張機能（PostGIS の spatial_ref_sys・geometry_columns や ST_* 関数など、pg_depend で deptype='e' の
--      もの）は対象外にする。拡張機能の管理下にあり、取り上げると拡張機能自身の動作を壊しうるため。
do $revoke$
declare
  r record;
begin
  for r in
    select n.nspname, c.relname, c.relkind
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    if r.relkind = 'S' then
      execute format('revoke all on sequence %I.%I from public, anon, authenticated, service_role', r.nspname, r.relname);
    else
      execute format('revoke all on table %I.%I from public, anon, authenticated, service_role', r.nspname, r.relname);
    end if;
  end loop;

  for r in
    select n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) as args
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_catalog.pg_depend d
        where d.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
          and d.objid = p.oid
          and d.deptype = 'e'
      )
  loop
    execute format('revoke all on routine %I.%I(%s) from public, anon, authenticated, service_role', r.nspname, r.proname, r.args);
  end loop;
end;
$revoke$;

-- 5-3. anon（未ログイン）: 読み取りだけ。行は RLS で絞る。
--      users の select は、spots の pending 用ポリシーが users を参照するために必要（行は RLS で0件）。
grant select on table
  public.cities,
  public.tags,
  public.badges,
  public.spots,
  public.spot_tags,
  public.endorsements,
  public.verifications,
  public.users,
  public.public_profiles,
  public.user_badges
  to anon;

-- 5-4. authenticated（ログイン済み）: anon の読み取り＋本人宛ての依頼・台帳、users の許可列、栞の読み書き。
--      users で書ける列は表示名・アバター・居住街・居住年数だけ（insert は id も）。
--      lantern_points / area_name / created_at は insert でも update でも指定できない（§9.13.4）。
grant select on table
  public.cities,
  public.tags,
  public.badges,
  public.spots,
  public.spot_tags,
  public.endorsements,
  public.verifications,
  public.users,
  public.public_profiles,
  public.user_badges,
  public.verification_requests,
  public.lantern_events
  to authenticated;
grant insert (id, display_name, avatar_url, home_city_id, resident_years) on table public.users to authenticated;
grant update (display_name, avatar_url, home_city_id, resident_years) on table public.users to authenticated;
grant select, insert, update, delete on table public.bookmarks to authenticated;

-- 5-5. service_role（サーバーの cron だけが使う）: 表の読み書きを明示する。
--      cron は run_verification_cron（security definer）だけを呼ぶが、運用時の調査・補正のため読み書きは与える。
--      truncate / references / trigger は与えない。
grant select, insert, update, delete on table
  public.cities,
  public.tags,
  public.badges,
  public.users,
  public.spots,
  public.spot_tags,
  public.endorsements,
  public.verifications,
  public.verification_requests,
  public.bookmarks,
  public.user_badges,
  public.lantern_events
  to service_role;
grant select on table public.public_profiles to service_role;

-- 5-6. 関数の EXECUTE
--   create_spot / endorse_spot / answer_verification: authenticated のみ（service_role は auth.uid() を持たない）
--   run_verification_cron: service_role のみ
--   is_profile_visible: public_profiles と user_badges のポリシーから呼ばれる（ビュー・ポリシー内の関数は
--     呼び出し者の権限で EXECUTE が検査される）ため、読める3ロールに与える。返すのは真偽値だけ。
--   award_lantern_points / publish_pending_spot: 誰にも与えない（security definer の関数の中からだけ使う）
grant execute on function public.create_spot(uuid, text, text, double precision, double precision, text) to authenticated;
grant execute on function public.endorse_spot(uuid) to authenticated;
grant execute on function public.answer_verification(uuid, text, text) to authenticated;
grant execute on function public.run_verification_cron() to service_role;
grant execute on function public.is_profile_visible(uuid) to anon, authenticated, service_role;

-- 5-7. 将来のオブジェクトに既定権限が付かないようにする（postgres が作るもの）。
--   - 表・シーケンス・関数: public スキーマの既定権限から anon / authenticated を外す。
--   - 関数の PUBLIC への EXECUTE は PostgreSQL の全体の既定なので、スキーマ単位では外せない。
--     postgres が作る関数全体（全スキーマ）について外す。
--   マイグレーションの実行ロールが postgres のメンバーでない環境では権限エラーになりうる。
--   その場合も上の明示的な GRANT / REVOKE は有効なので、警告にとどめて続行する（報告・README を参照）。
--   supabase_admin など他ロールの既定権限は、postgres からは変更できないため対象外。
do $defaults$
begin
  alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
  alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
  alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;
  alter default privileges for role postgres revoke execute on functions from public;
exception
  when insufficient_privilege then
    raise warning '既定権限（alter default privileges for role postgres）を変更できませんでした: %', sqlerrm;
end;
$defaults$;
