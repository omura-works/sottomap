-- 0012: 公開データの絞り込み（docs/SPEC.md §9.18、最終レビュー R20 重要1・重要2・軽微）
--
--   1. 確認の回答（verifications）で公開するのは id, spot_id, answer, created_at だけにする。
--      - anon / authenticated の表単位の SELECT を外し、上の4列だけを列単位で与える（行の範囲は 0006 の RLS のまま）。
--        回答者のID（user_id）・備考（note）・依頼ID（verification_request_id）は読めない。
--      - 店ごとの「確認した人数」は集計 RPC spot_verifier_counts(uuid[])（店のIDと人数だけを返す）。
--      - 本人の実績（/me の「確認した回数」・冬の確認）は本人専用 RPC list_my_verification_times()（auth.uid() の分だけ）。
--      - answer_verification の p_note は500文字まで。
--   2. public_profiles から area_name・resident_years も外す（id, display_name だけ）。既存の値は NULL にする。
--      署名（src/lib/domain/author-label.ts）は表示名だけ。
--   3. 表示名に見えない書式文字（Unicode の Cf。双方向制御文字を含む）を許さない（set_display_name と既存の表示名）。

-- =========================================================
-- 1. verifications の公開列
-- =========================================================

-- 1-1. 表単位の SELECT を外し、公開する4列だけを与える。service_role（運営・cron）は 0006 のまま表単位で読める。
--      RLS（0006 の verifications_select_visible_or_own）は変えない。ポリシーの中の user_id の参照には
--      利用者の列権限は要らないので、読める行の範囲はこれまでと同じ（読める列だけが減る）。
revoke select on table public.verifications from anon, authenticated;
grant select (id, spot_id, answer, created_at) on table public.verifications to anon, authenticated;

-- 1-2. 店ごとの「確認した人数」: 直近の回答から24時間以内に回答した人の数（SPEC §9.8 の「地元◯人」）。
--      security definer（回答者のIDは関数の中でだけ数える）。返すのは店のIDと人数だけ。
--      数える店は spots の RLS（0002）と同じ範囲に絞る:
--        公開中は全員 / 投稿者本人はどの状態でも / pending は同じ街に住む人。
--      回答が1件も無い店の行は返さない（アプリ側で 0 にする）。
create or replace function public.spot_verifier_counts(p_spot_ids uuid[])
returns table (spot_id uuid, verifier_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  with visible as (
    select s.id
    from public.spots s
    where s.id = any (coalesce(p_spot_ids, array[]::uuid[]))
      and (
        s.status = 'published'
        or (auth.uid() is not null and s.author_id = auth.uid())
        or (
          s.status = 'pending'
          and exists (
            select 1
            from public.users u
            where u.id = auth.uid()
              and u.home_city_id = s.city_id
          )
        )
      )
  ),
  latest as (
    select v.spot_id, max(v.created_at) as latest_at
    from public.verifications v
    join visible on visible.id = v.spot_id
    group by v.spot_id
  )
  select v.spot_id, count(distinct v.user_id)::integer as verifier_count
  from public.verifications v
  join latest l on l.spot_id = v.spot_id
  where v.created_at > l.latest_at - interval '24 hours'
  group by v.spot_id;
$$;

comment on function public.spot_verifier_counts(uuid[]) is
  'SPEC §9.18-2（0012）: 店ごとの「確認した人数」（直近の回答から24時間以内に回答した人の数）。店のIDと人数だけを返す。数える店は spots の RLS と同じ範囲。';

-- 1-3. 本人の回答日時（/me の「確認した回数」と冬の確認の数え上げ）。auth.uid() の分だけ。
create or replace function public.list_my_verification_times()
returns setof timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  return query
    select v.created_at
    from public.verifications v
    where v.user_id = v_uid
    order by v.created_at;
end;
$$;

comment on function public.list_my_verification_times() is
  'SPEC §9.18-2（0012）: 本人の確認の回答日時だけを返す（/me の実績用）。authenticated のみ。';

-- 1-4. answer_verification（0006）に備考の長さの上限（500文字）を足す。ほかの検査・順序・処理は 0006 のまま。
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

  -- 0012（R20 重要1）: 備考は画面では使わないが、RPC を直接呼べば入れられるので長さを制限する。
  if p_note is not null and char_length(p_note) > 500 then
    raise exception '備考は500文字以内で入力してください' using errcode = '22023';
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

-- =========================================================
-- 2. 公開プロフィール
-- =========================================================

-- 2-1. public_profiles は id, display_name だけ（0011 の定義から area_name・resident_years を外す。行の絞り込みは同じ）。
drop view if exists public.public_profiles;
create view public.public_profiles
  with (security_barrier = true)
as
  select u.id, u.display_name
  from public.users u
  where public.is_profile_visible(u.id);

comment on view public.public_profiles is
  '投稿者クレジット表示用（SPEC §9.13.6・§9.18-2）。id, display_name のみ。本人・公開中スポットの投稿者・呼び出し者が読める pending スポットの投稿者だけ。';

revoke all on table public.public_profiles from public, anon, authenticated, service_role;
grant select on table public.public_profiles to anon, authenticated, service_role;

-- =========================================================
-- 3. 表示名の書式文字
-- =========================================================

-- 3-1. 見えない書式文字（Unicode 17.0 の一般カテゴリ Cf。双方向制御文字 Bidi_Control はすべて Cf）を含むか。
--      src/lib/domain/display-name.ts の FORMAT_CHARACTER_RANGES と同じ一覧。内部関数（誰にも EXECUTE を与えない）。
create or replace function public.contains_format_character(p_text text)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.regexp_split_to_table(p_text, '') as c(ch)
    join (values
      (0x00AD, 0x00AD), (0x0600, 0x0605), (0x061C, 0x061C), (0x06DD, 0x06DD), (0x070F, 0x070F),
      (0x0890, 0x0891), (0x08E2, 0x08E2), (0x180E, 0x180E), (0x200B, 0x200F), (0x202A, 0x202E),
      (0x2060, 0x2064), (0x2066, 0x206F), (0xFEFF, 0xFEFF), (0xFFF9, 0xFFFB), (0x110BD, 0x110BD),
      (0x110CD, 0x110CD), (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A), (0xE0001, 0xE0001),
      (0xE0020, 0xE007F)
    ) as r(lo, hi)
      on pg_catalog.ascii(c.ch) between r.lo and r.hi
  );
$$;

comment on function public.contains_format_character(text) is
  'SPEC §9.18-1（0012）: 見えない書式文字（Unicode の Cf。双方向制御文字を含む）を含むか。内部関数。';

-- 3-2. set_display_name（0011）に書式文字の検査を足す。前後の空白を除いても書式文字は残るので、
--      空・長さの検査より先に調べる（アプリの validateDisplayName と同じ順序・同じ文言）。ほかは 0011 のまま。
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

  if public.contains_format_character(v_name) then
    raise exception '表示名に改行や制御文字は使えません' using errcode = '22023';
  end if;
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
  'SPEC §9.18-1: 本人の表示名を変える（1〜20文字・改行や制御文字や見えない書式文字なし・メールアドレスの形なし）。保存した名前を返す。';

-- =========================================================
-- 4. 既存のデータの整理（マイグレーションで1回呼ぶ。誰にも EXECUTE を与えない）
--    - users.area_name・resident_years を NULL にする（画面から入れられず、公開もしない項目）。
--    - 表示名に書式文字を含む行を「地元の人」に置き換える。
--    変えた行の数を返す。
-- =========================================================
create or replace function public.minimize_profile_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.users u
  set area_name = null,
      resident_years = null,
      display_name = case
        when public.contains_format_character(u.display_name) then '地元の人'
        else u.display_name
      end
  where u.area_name is not null
     or u.resident_years is not null
     or public.contains_format_character(u.display_name);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.minimize_profile_data() is
  'SPEC §9.18-2（0012）: users.area_name・resident_years を NULL にし、書式文字を含む表示名を「地元の人」に置き換え、件数を返す。マイグレーション専用。';

select public.minimize_profile_data();

-- =========================================================
-- 5. 関数の EXECUTE
--   spot_verifier_counts: anon / authenticated（店のIDと人数だけを返す）
--   list_my_verification_times: authenticated のみ
--   answer_verification / set_display_name: authenticated のみ（0006・0011 と同じ）
--   contains_format_character / minimize_profile_data: 誰にも与えない
-- =========================================================
revoke all on function public.spot_verifier_counts(uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.list_my_verification_times() from public, anon, authenticated, service_role;
revoke all on function public.answer_verification(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.set_display_name(text) from public, anon, authenticated, service_role;
revoke all on function public.contains_format_character(text) from public, anon, authenticated, service_role;
revoke all on function public.minimize_profile_data() from public, anon, authenticated, service_role;

grant execute on function public.spot_verifier_counts(uuid[]) to anon, authenticated;
grant execute on function public.list_my_verification_times() to authenticated;
grant execute on function public.answer_verification(uuid, text, text) to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
