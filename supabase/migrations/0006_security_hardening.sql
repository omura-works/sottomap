-- ウラスポ 安全性と整合性の強化（docs/SPEC.md §9.13、2026-09-14 最終レビュー領域Aの裁定）
--
-- 原則: 状態・時刻・ポイントを変える書き込みは、利用者に直接させない。
--       DB 関数（security definer）に集約し、対象行をロックしたうえで DB が条件を再検査する。
--
-- 0001〜0005 は適用済みの前提で書き換えない。このマイグレーションで次を行う。
--   1. ポイント台帳 lantern_events（unique (kind, source_id)）
--   2. verifications.verification_request_id（verification_requests への FK・一意）
--   3. 直接の書き込み権限の取り上げ（users は列単位）と、読み取り範囲の絞り込み
--   4. DB 関数 create_spot / endorse_spot / answer_verification / run_verification_cron
--
-- 注意（Supabase の既定権限）:
--   public スキーマに作った表には anon / authenticated へ全権限が、関数には PUBLIC・anon・authenticated へ
--   EXECUTE が既定で付く。RLS だけに頼らず、ここで明示的に取り上げてから必要なものだけ付け直す。
--
-- 時刻の規則（すべて DB の now() を使う。利用者は時刻を指定できない）:
--   - pending の期限: created_at + 30日（絶対時刻）。now >= 期限 で expired。
--     ただし期限までに（同時刻を含む）2人の承認が成立していれば公開を優先する（§9.7・§9.13.5）。
--   - 確認に回答できる: open かつ due_at <= now。または dormant のスポットの最新の missed に1回だけ（§9.13.3）。
--   - missed: open かつ now >= due_at + 90日。
--   - 次の依頼の due_at: 公開・回答の時点 + 90日。
--
-- 行ロックの順序（デッドロック回避）: どの関数も「spots の行 → verification_requests の行」の順にロックする。

-- =========================================================
-- 1. ポイント台帳（§9.13.4）
--    確認: kind='verification', source_id = verification_requests.id
--    公開: kind='publish',      source_id = spots.id
-- =========================================================
create table if not exists lantern_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  kind text not null check (kind in ('verification', 'publish')),
  source_id uuid not null,
  points integer not null check (points > 0),
  created_at timestamptz not null default now(),
  constraint lantern_events_kind_source_unique unique (kind, source_id)
);

create index if not exists lantern_events_user_idx on lantern_events (user_id, created_at desc);

comment on table lantern_events is
  '灯りポイントの台帳（SPEC §9.13.4）。(kind, source_id) につき一度だけ記録し、同じトランザクションで users.lantern_points を加算する。';

alter table lantern_events enable row level security;

-- =========================================================
-- 2. verifications.verification_request_id（§9.13.2）
--    依頼を経由しない回答を不可能にする（書き込みは answer_verification だけが行う）。
--    既存行（seed・0005以前のデータ）は依頼に紐づかないことがあるため NULL を許す。
--    NULL は一意制約の対象外。新しい行は answer_verification が必ず依頼IDを入れる。
-- =========================================================
alter table verifications
  add column if not exists verification_request_id uuid
    references verification_requests (id) on delete set null;

create unique index if not exists verifications_verification_request_id_key
  on verifications (verification_request_id);

-- 既存の回答済み依頼（answered_verification_id）から逆向きの紐づけを埋める。
-- 1つの回答に複数の依頼が紐づいている異常データがあっても一意制約に反しないよう、最も古い依頼だけを採る。
update verifications v
set verification_request_id = src.request_id
from (
  select distinct on (vr.answered_verification_id)
    vr.answered_verification_id as verification_id,
    vr.id as request_id
  from verification_requests vr
  where vr.answered_verification_id is not null
  order by vr.answered_verification_id, vr.created_at, vr.id
) src
where v.id = src.verification_id
  and v.verification_request_id is null
  and not exists (
    select 1 from verifications other where other.verification_request_id = src.request_id
  );

-- =========================================================
-- 3. 権限と読み取り範囲
-- =========================================================

-- 3-1. 状態・時刻・ポイントを持つ表: 直接の書き込みを取り上げる（読み取りは RLS で絞る）
revoke insert, update, delete, truncate, references, trigger
  on table spots, endorsements, verifications, verification_requests
  from anon, authenticated;

-- 参照専用の表（書き込みは seed / service role のみ。0002 でも書き込みポリシーは無い）も念のため取り上げる
revoke insert, update, delete, truncate, references, trigger
  on table cities, tags, badges, spot_tags, user_badges
  from anon, authenticated;

-- 取り上げたので、直接書き込み用のポリシーも不要（残すと誤解を招くため削除する）
drop policy if exists spots_insert_own on spots;
drop policy if exists endorsements_insert_self_same_city_not_own_spot on endorsements;
drop policy if exists verifications_insert_spot_author_only on verifications;

-- 3-2. lantern_events: 本人の行だけ読める。書き込みは DB 関数だけ。
revoke all on table lantern_events from anon, authenticated;
grant select on table lantern_events to authenticated;

drop policy if exists lantern_events_select_self on lantern_events;
create policy lantern_events_select_self on lantern_events
  for select to authenticated
  using (user_id = auth.uid());

-- 3-3. users: 利用者が書ける列は表示名・アバター・居住街・居住年数だけ（§9.13.4）。
--      lantern_points / area_name / created_at は insert でも update でも指定できない。
--      select 権限は anon にも残す: spots の pending 用ポリシーが users を参照しており、
--      参照先の select 権限が無いと匿名の spots 読み取り自体が権限エラーになるため。
--      行は下の RLS で本人に限る（匿名には1行も見えない）。
revoke all on table users from anon, authenticated;
grant select on table users to anon, authenticated;
grant insert (id, display_name, avatar_url, home_city_id, resident_years) on table users to authenticated;
grant update (display_name, avatar_url, home_city_id, resident_years) on table users to authenticated;

-- 全列の select は本人のみ（§9.13.6）
drop policy if exists users_select_all on users;
drop policy if exists users_select_self on users;
create policy users_select_self on users
  for select
  using (id = auth.uid());

-- 投稿者クレジット表示用の列だけを出すビュー。
-- security_invoker を付けない（既定＝ビュー所有者の権限）ので users の RLS を通らずに全員分を読めるが、
-- 出すのは表示用の5列だけ（home_city_id・lantern_points・created_at は出さない）。
create or replace view public_profiles as
  select id, display_name, area_name, resident_years, avatar_url
  from users;

comment on view public_profiles is
  '投稿者クレジット表示用（SPEC §9.13.6）。id, display_name, area_name, resident_years, avatar_url のみ。';

revoke all on table public_profiles from anon, authenticated;
grant select on table public_profiles to anon, authenticated;

-- 3-4. endorsements / verifications: 読めるスポットに紐づく行、または本人の行だけ（§9.13.6）。
--      「読めるスポット」は spots の RLS をそのまま使う（公開中は全員、pending は投稿者と同じ街の住人、
--      dormant / expired は投稿者本人）。サブクエリの spots には呼び出し者の RLS がかかる。
drop policy if exists endorsements_select_all on endorsements;
drop policy if exists endorsements_select_visible_or_own on endorsements;
create policy endorsements_select_visible_or_own on endorsements
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from spots s where s.id = endorsements.spot_id)
  );

drop policy if exists verifications_select_all on verifications;
drop policy if exists verifications_select_visible_or_own on verifications;
create policy verifications_select_visible_or_own on verifications
  for select
  using (
    user_id = auth.uid()
    or exists (select 1 from spots s where s.id = verifications.spot_id)
  );

-- verification_requests: 0002 の verification_requests_select_self（user_id = auth.uid()）のまま。本人宛てのみ。

-- =========================================================
-- 4. DB 関数
--    security definer の関数は所有者（マイグレーション実行ロール）の権限で動き、RLS を通らない。
--    そのため「誰が・どの行に・いつ」書けるかは、すべて関数の中で auth.uid() と now() を使って検査する。
--    search_path は固定する（public と、pg_temp を最後に明示）。
-- =========================================================

-- 4-0. 内部用: 台帳に記録できたときだけポイントを加算する（同じ (kind, source_id) は二度と加算しない）
create or replace function award_lantern_points(
  p_user_id uuid,
  p_kind text,
  p_source_id uuid,
  p_points integer
) returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  insert into lantern_events (user_id, kind, source_id, points)
  values (p_user_id, p_kind, p_source_id, p_points)
  on conflict (kind, source_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return 0;
  end if;

  update users
  set lantern_points = lantern_points + p_points
  where id = p_user_id;

  return p_points;
end;
$$;

-- 4-0'. 内部用: pending のスポットを公開する。呼び出し側が spots の行を for update でロック済みであること。
--       公開時刻・次の依頼（now + 90日）・公開 +10（published_at が初めて入るときだけ、台帳で一回きり）を
--       呼び出し側と同じトランザクションで行う。戻り値は「open な依頼を新しく作ったか」。
create or replace function publish_pending_spot(p_spot_id uuid, p_now timestamptz)
returns boolean
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_author_id uuid;
  v_published_at timestamptz;
  v_created integer;
begin
  select author_id, published_at
  into v_author_id, v_published_at
  from spots
  where id = p_spot_id;

  update spots
  set status = 'published',
      published_at = coalesce(published_at, p_now),
      next_verification_at = p_now + interval '90 days'
  where id = p_spot_id;

  insert into verification_requests (spot_id, user_id, due_at, status)
  values (p_spot_id, v_author_id, p_now + interval '90 days', 'open')
  on conflict (spot_id) where status = 'open' do nothing;
  get diagnostics v_created = row_count;

  if v_published_at is null then
    perform award_lantern_points(v_author_id, 'publish', p_spot_id, 10);
  end if;

  return v_created > 0;
end;
$$;

-- 内部用の2関数は、利用者からも service_role からも直接は呼べない（security definer の関数からだけ使う）
revoke execute on function award_lantern_points(uuid, text, uuid, integer) from public, anon, authenticated, service_role;
revoke execute on function publish_pending_spot(uuid, timestamptz) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------
-- 4-1. create_spot: S5「ピンを立てる」
--   検査: ログイン済み / 投稿者の home_city_id と投稿先の街が一致（地元の人だけ）/ 入力の範囲。
--   DB が決める: author_id = auth.uid()、status = 'pending'、quietness = 'quiet'、時刻列（created_at = now()）。
-- ---------------------------------------------------------
create or replace function create_spot(
  p_city_id uuid,
  p_name text,
  p_reason text,
  p_lat double precision,
  p_lng double precision,
  p_visit_frequency text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_home_city_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_spot_id uuid;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select home_city_id into v_home_city_id from users where id = v_uid;
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

  insert into spots (city_id, name, reason, visit_frequency, location, author_id, status, quietness)
  values (
    p_city_id,
    v_name,
    p_reason,
    p_visit_frequency,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    v_uid,
    'pending',
    'quiet'
  )
  returning id into v_spot_id;

  return v_spot_id;
end;
$$;

-- ---------------------------------------------------------
-- 4-2. endorse_spot: 「行ったことがある」
--   スポット行をロックして検査: ログイン済み / 投稿者本人でない / 同じ街の住人 /
--   pending（※）/ 承認時刻（DB の now()）が期限（created_at + 30日）以前。重複は無視（冪等）。
--   期限までの承認が2人になったら、公開・published_at・次の依頼（now + 90日）・公開 +10 を同じトランザクションで。
--   ※ expired でも、この承認の DB 時刻が期限以前なら受け付ける。cron が期限直後に先にロックを取って
--     expired にした場合でも「2人目の承認の DB 時刻が期限前なら公開が勝つ」（§9.13.5）を守るため。
-- ---------------------------------------------------------
create or replace function endorse_spot(p_spot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_spot spots%rowtype;
  v_home_city_id uuid;
  v_deadline timestamptz;
  v_timely_count integer;
  v_status text;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  select * into v_spot from spots where id = p_spot_id for update;
  if not found then
    raise exception 'スポットが見つかりませんでした' using errcode = 'P0002';
  end if;

  if v_spot.author_id = v_uid then
    raise exception '自分の投稿には「行ったことがある」を押せません' using errcode = '42501';
  end if;

  select home_city_id into v_home_city_id from users where id = v_uid;
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
  insert into endorsements (spot_id, user_id)
  values (p_spot_id, v_uid)
  on conflict (spot_id, user_id) do nothing;

  select count(*) into v_timely_count
  from endorsements e
  where e.spot_id = p_spot_id
    and e.user_id <> v_spot.author_id
    and e.created_at <= v_deadline;

  if v_timely_count >= 2 then
    perform publish_pending_spot(p_spot_id, v_now);
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
create or replace function answer_verification(
  p_request_id uuid,
  p_answer text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_spot_id uuid;
  v_spot spots%rowtype;
  v_request verification_requests%rowtype;
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
  select spot_id into v_spot_id
  from verification_requests
  where id = p_request_id
    and user_id = v_uid;
  if not found then
    raise exception '確認依頼が見つかりませんでした' using errcode = 'P0002';
  end if;

  select * into v_spot from spots where id = v_spot_id for update;
  if not found then
    raise exception '対象スポットが見つかりませんでした' using errcode = 'P0002';
  end if;

  select * into v_request from verification_requests where id = p_request_id for update;

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
    from verification_requests vr
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

  insert into verifications (spot_id, user_id, answer, note, verification_request_id)
  values (v_spot.id, v_uid, p_answer, p_note, v_request.id)
  returning id into v_verification_id;

  update verification_requests
  set status = 'answered',
      answered_verification_id = v_verification_id
  where id = v_request.id;

  v_new_status := case when v_spot.status = 'dormant' then 'published' else v_spot.status end;

  update spots
  set quietness = p_answer,
      last_verified_at = v_now,
      next_verification_at = v_now + interval '90 days',
      status = v_new_status
  where id = v_spot.id;

  if v_new_status = 'published' then
    insert into verification_requests (spot_id, user_id, due_at, status)
    values (v_spot.id, v_spot.author_id, v_now + interval '90 days', 'open')
    on conflict (spot_id) where status = 'open' do nothing;
  end if;

  v_points := award_lantern_points(v_uid, 'verification', v_request.id, 5);

  return jsonb_build_object('accepted', true, 'pointsAwarded', v_points, 'status', v_new_status);
end;
$$;

-- ---------------------------------------------------------
-- 4-4. run_verification_cron: 期限処理（service_role 専用）
--   (a) pending: 期限（created_at + 30日）までの承認が2人以上なら公開（期限後の実行でも公開が勝つ）、
--       そうでなく now >= 期限なら expired。
--   (b) open かつ now >= due_at + 90日 → missed、スポットは dormant。
--   (c) published で open の依頼が無いスポットに依頼（now + 90日）を作る。
--   各スポットはロックしてから条件を再検査するので、承認・回答と同時に走っても二重に遷移しない。冪等。
-- ---------------------------------------------------------
create or replace function run_verification_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := now();
  v_checked integer := 0;
  v_changed integer := 0;
  v_missed integer := 0;
  v_created integer := 0;
  v_rows integer;
  v_timely_count integer;
  r record;
begin
  select count(*) into v_checked from spots where status in ('pending', 'published');

  -- (a) pending の期限処理
  for r in
    select s.id from spots s where s.status = 'pending' order by s.id
  loop
    perform 1 from spots where id = r.id and status = 'pending' for update;
    if not found then
      continue;
    end if;

    select count(*) into v_timely_count
    from endorsements e
    join spots s on s.id = e.spot_id
    where e.spot_id = r.id
      and e.user_id <> s.author_id
      and e.created_at <= s.created_at + interval '30 days';

    if v_timely_count >= 2 then
      if publish_pending_spot(r.id, v_now) then
        v_created := v_created + 1;
        v_changed := v_changed + 1;
      end if;
      v_changed := v_changed + 1;
    else
      update spots
      set status = 'expired'
      where id = r.id
        and status = 'pending'
        and v_now >= created_at + interval '30 days';
      get diagnostics v_rows = row_count;
      v_changed := v_changed + v_rows;
    end if;
  end loop;

  -- (b) missed → dormant
  for r in
    select vr.id as request_id, vr.spot_id
    from verification_requests vr
    where vr.status = 'open'
      and v_now >= vr.due_at + interval '90 days'
    order by vr.spot_id, vr.id
  loop
    perform 1 from spots where id = r.spot_id for update;

    update verification_requests
    set status = 'missed'
    where id = r.request_id
      and status = 'open'
      and v_now >= due_at + interval '90 days';
    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      v_missed := v_missed + 1;
      v_changed := v_changed + 1;

      update spots set status = 'dormant' where id = r.spot_id and status = 'published';
      get diagnostics v_rows = row_count;
      v_changed := v_changed + v_rows;
    end if;
  end loop;

  -- (c) open の依頼が無い published スポットに次の依頼を作る
  for r in
    select s.id, s.author_id
    from spots s
    where s.status = 'published'
      and not exists (
        select 1 from verification_requests vr where vr.spot_id = s.id and vr.status = 'open'
      )
    order by s.id
  loop
    perform 1 from spots where id = r.id and status = 'published' for update;
    if not found then
      continue;
    end if;

    insert into verification_requests (spot_id, user_id, due_at, status)
    values (r.id, r.author_id, v_now + interval '90 days', 'open')
    on conflict (spot_id) where status = 'open' do nothing;
    get diagnostics v_rows = row_count;

    if v_rows > 0 then
      update spots set next_verification_at = v_now + interval '90 days' where id = r.id;
      v_created := v_created + 1;
      v_changed := v_changed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'changed', v_changed,
    'missedRequestCount', v_missed,
    'createdRequestCount', v_created
  );
end;
$$;

-- ---------------------------------------------------------
-- 4-5. EXECUTE 権限: 必要なロールだけに付与する
--   create_spot / endorse_spot / answer_verification: authenticated のみ（anon は不可。
--     service_role も auth.uid() を持たないため付与しない）
--   run_verification_cron: service_role のみ
-- ---------------------------------------------------------
revoke execute on function create_spot(uuid, text, text, double precision, double precision, text)
  from public, anon, authenticated, service_role;
grant execute on function create_spot(uuid, text, text, double precision, double precision, text)
  to authenticated;

revoke execute on function endorse_spot(uuid) from public, anon, authenticated, service_role;
grant execute on function endorse_spot(uuid) to authenticated;

revoke execute on function answer_verification(uuid, text, text) from public, anon, authenticated, service_role;
grant execute on function answer_verification(uuid, text, text) to authenticated;

revoke execute on function run_verification_cron() from public, anon, authenticated;
grant execute on function run_verification_cron() to service_role;
