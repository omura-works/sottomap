-- 0014: 退会（アカウントの削除）・照合・確認の備考・表示名の見えない文字（docs/SPEC.md §9.17・§9.18、最終レビュー R21）
--
--   1. 確認の回答の備考（verifications.note）は保存しない（R21 重要1）。
--      - answer_verification は p_note を受け取っても使わず、常に NULL で保存する（引数の形は 0006 のまま）。
--      - 既存の値を NULL にし、表の制約（note is null）で以後も入らないようにする。
--   2. 退会 = アカウントの削除（R21 決定事項）。
--      - contact_messages.requester_id の外部キーを on delete set null（0010）から on delete cascade に変える。
--        アカウントを消すと、そのアカウントで（ログイン中に）送った問い合わせの記録も消える。
--        ログインせずに送った問い合わせ（requester_id が NULL）は、アカウントに結び付かないので残る。
--      - 運営用 RPC delete_account(p_user_id uuid): auth.users から削除する。既存の on delete cascade で
--        public.users・投稿・承認・確認の回答と依頼・栞・灯りの台帳・バッジ・問い合わせが消える。
--   3. 照合用の運営用 RPC find_account_by_email(p_email text) returns uuid（R21 決定事項）。
--      ログインできない人の請求で、返信先を auth.users のメールアドレスと照合する（前後の空白・大文字小文字を揃える）。
--   4. 表示名の見えない文字（R21 軽微2）: ZWNJ（U+200C）・ZWJ（U+200D）・タグ文字（U+E0020–U+E007F）は許す。
--      ほかの書式文字（Cf）は「表示名に見えない文字は使えません」で拒否する（src/lib/domain/display-name.ts と同じ）。
--
-- spot_verifier_counts（0012）と spots の RLS のずれは supabase/tests/0014_account_deletion_and_note.sql が検出する（R21 軽微4）。

-- =========================================================
-- 1. 確認の回答の備考
-- =========================================================

-- 1-1. 既存の備考を消す。
update public.verifications set note = null where note is not null;

-- 1-2. 以後も入らないようにする（運営が画面から直接入れる場合も含めて）。
alter table public.verifications
  drop constraint if exists verifications_note_always_null;
alter table public.verifications
  add constraint verifications_note_always_null check (note is null);

comment on column public.verifications.note is
  '使わない（R21 重要1・0014）。備考は集めないので常に NULL（表の制約 verifications_note_always_null）。';

-- 1-3. answer_verification（0012）から備考の検査と保存を外す。p_note は受け取るが使わない（呼び出しの互換のため）。
--      ほかの検査・順序・処理は 0012 のまま。
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

  -- 0014（R21 重要1）: 備考（p_note）は受け取っても使わない（保存しない・検査もしない）。

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

  insert into public.verifications (spot_id, user_id, answer, verification_request_id)
  values (v_spot.id, v_uid, p_answer, v_request.id)
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

comment on function public.answer_verification(uuid, text, text) is
  'SPEC §9.13.2・§9.18-2: 確認に回答する（authenticated のみ）。p_note は受け取っても保存しない（R21 重要1・0014）。';

-- =========================================================
-- 2. 退会（アカウントの削除）
-- =========================================================

-- 2-1. 問い合わせの送信者の外部キーを on delete cascade に変える（0010 の名前が変わっていても外せるよう、列から探す）。
do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.contact_messages'::regclass
      and c.contype = 'f'
      and a.attname = 'requester_id'
  loop
    execute pg_catalog.format('alter table public.contact_messages drop constraint %I', v_name);
  end loop;
end;
$$;

alter table public.contact_messages
  add constraint contact_messages_requester_id_fkey
  foreign key (requester_id) references auth.users (id) on delete cascade;

comment on column public.contact_messages.requester_id is
  '送信時にログインしていた利用者（auth.users.id）。未ログインなら NULL。退会（アカウントの削除）でこの行も消える（on delete cascade、0014）。privacy（個人情報の請求）は requester_id か reply_to のどちらかが必須（RPC が検査。0013）。';

-- 2-2. 運営用: アカウントを削除する（service_role のみ）。本人確認は運営が行ってから呼ぶ（docs/DEPLOY.md）。
create or replace function public.delete_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'アカウントを指定してください' using errcode = '22023';
  end if;

  -- auth.users の削除で、public.users（on delete cascade）→ 投稿・承認・確認の回答と依頼・栞・灯りの台帳・バッジ、
  -- contact_messages（requester_id、on delete cascade）が消える。
  delete from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'アカウントが見つかりませんでした' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.delete_account(uuid) is
  'R21 決定事項（0014）: 退会。auth.users を削除し、cascade でそのアカウントの投稿・承認・確認・栞・台帳・問い合わせまで消す。service_role のみ。';

-- 2-3. 運営用: 返信先のメールアドレスから登録を探す（service_role のみ）。
--      前後の空白（全角空白・改行を含む）を除き、大文字小文字を揃えて auth.users.email と比べる。
--      見つからなければ NULL。大文字小文字だけが違う登録が複数あれば、どれか一つを選ばずに止める。
create or replace function public.find_account_by_email(p_email text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_ids uuid[];
begin
  v_email := pg_catalog.lower(
    pg_catalog.regexp_replace(coalesce(p_email, ''), '^[[:space:]　]+|[[:space:]　]+$', '', 'g')
  );
  if v_email = '' then
    return null;
  end if;

  select pg_catalog.array_agg(u.id) into v_ids
  from auth.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_email;

  if v_ids is null then
    return null;
  end if;
  if pg_catalog.cardinality(v_ids) > 1 then
    raise exception 'このメールアドレスに当たる登録が複数あります' using errcode = '21000';
  end if;
  return v_ids[1];
end;
$$;

comment on function public.find_account_by_email(text) is
  'R21 決定事項（0014）: 返信先のメールアドレスを auth.users.email と照合し、一致した登録の ID を返す（無ければ NULL）。service_role のみ。';

-- =========================================================
-- 3. 表示名の見えない文字
-- =========================================================

-- 3-1. contains_format_character（0012）から、ZWNJ・ZWJ（U+200C–U+200D）とタグ文字（U+E0020–U+E007F）を外す。
--      名前は変えない（minimize_profile_data・set_display_name が使う）。
--      src/lib/domain/display-name.ts の FORMAT_CHARACTER_RANGES から ALLOWED_FORMAT_CHARACTER_RANGES を除いたものと同じ。
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
      (0x0890, 0x0891), (0x08E2, 0x08E2), (0x180E, 0x180E), (0x200B, 0x200B), (0x200E, 0x200F),
      (0x202A, 0x202E), (0x2060, 0x2064), (0x2066, 0x206F), (0xFEFF, 0xFEFF), (0xFFF9, 0xFFFB),
      (0x110BD, 0x110BD), (0x110CD, 0x110CD), (0x13430, 0x1343F), (0x1BCA0, 0x1BCA3), (0x1D173, 0x1D17A),
      (0xE0001, 0xE0001)
    ) as r(lo, hi)
      on pg_catalog.ascii(c.ch) between r.lo and r.hi
  );
$$;

comment on function public.contains_format_character(text) is
  'SPEC §9.18-1（0012、0014 で改訂）: 表示名に使えない見えない文字（Unicode の Cf から ZWNJ・ZWJ・タグ文字 U+E0020–U+E007F を除いたもの）を含むか。内部関数。';

-- 3-2. set_display_name（0012）の見えない文字の文言を「表示名に見えない文字は使えません」に変える。ほかは 0012 のまま。
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

  -- 0014（R21 軽微2）: 見えない文字（ZWNJ・ZWJ・タグ文字を除く書式文字）は専用の文言。
  if public.contains_format_character(v_name) then
    raise exception '表示名に見えない文字は使えません' using errcode = '22023';
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
  'SPEC §9.18-1: 本人の表示名を変える（1〜20文字・改行や制御文字なし・見えない文字なし〈ZWNJ・ZWJ・タグ文字は可〉・メールアドレスの形なし）。保存した名前を返す。';

-- =========================================================
-- 4. 関数の EXECUTE
--   delete_account / find_account_by_email: service_role のみ
--   answer_verification / set_display_name: authenticated のみ（0012 と同じ）
--   contains_format_character: 誰にも与えない
-- =========================================================
revoke all on function public.delete_account(uuid) from public, anon, authenticated, service_role;
revoke all on function public.find_account_by_email(text) from public, anon, authenticated, service_role;
revoke all on function public.answer_verification(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.set_display_name(text) from public, anon, authenticated, service_role;
revoke all on function public.contains_format_character(text) from public, anon, authenticated, service_role;

grant execute on function public.delete_account(uuid) to service_role;
grant execute on function public.find_account_by_email(text) to service_role;
grant execute on function public.answer_verification(uuid, text, text) to authenticated;
grant execute on function public.set_display_name(text) to authenticated;
