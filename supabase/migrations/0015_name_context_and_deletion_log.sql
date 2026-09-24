-- 0015: 表示名の見えない文字の並び・退会の記録（docs/SPEC.md §9.17・§9.18、最終レビュー R22 重要2・決定事項）
--
--   1. 表示名の見えない文字を並びで調べる（R22 重要2）。src/lib/domain/display-name.ts の hasInvisibleSequence と同じ規則。
--      - 見える文字が1つも無い名前は拒否（ZWJ だけ・結合文字だけ・ハングルの埋め字だけ など）。
--      - タグ文字（U+E0020–U+E007F）は「黒旗 U+1F3F4 ＋ タグ列（U+E0020–U+E007E を1文字以上）＋ 終端 U+E007F」の中だけ。
--      - ZWJ（U+200D）は前後が絵文字のときだけ（前は肌の色の修飾子・VS16・地域旗のタグ列を遡って絵文字）。
--      - ZWNJ（U+200C）は前後が文字（Letter）のときだけ（前は結合文字を遡る）。
--      正規表現の Unicode プロパティが使えないので、PL/pgSQL で1文字ずつ見る。絵文字・文字の判定は代表的な範囲で行い、
--      アプリが受け付ける名前は必ず受け付ける（アプリより緩い側に寄せる。アプリが厳密、DB は最後の砦）。
--      拒否の文言は「表示名に見えない文字は使えません」（0014 と同じ）。検査の順はアプリと同じ
--      （書式文字 → 空 → 20文字 → 改行や制御文字 → 並び・見える文字 → メールアドレスの形）。
--      既存の表示名は書き換えない（本番のデータはまだ無い。0012 のように元の値を失わせない。SPEC §9.18）。
--   2. 退会の記録 account_deletion_log（R22 決定事項）。
--      - delete_account（0014）が、消したアカウントの ID と日時を記録する。
--      - reapply_account_deletions(): バックアップから戻した後に、記録にあるアカウントを再び削除する（service_role のみ）。
--      - purge_expired_account_deletion_log(): 退会から30日（バックアップの保存期間）を過ぎた記録を消す
--        （service_role のみ。日次の cron /api/cron/verification の最後に呼ぶ）。

-- =========================================================
-- 1. 表示名の見えない文字の並び
-- =========================================================

-- 1-1. 絵文字（Extended_Pictographic を含む代表的な範囲）。地域指示子（U+1F1E6–U+1F1FF）と肌の色の修飾子
--      （U+1F3FB–U+1F3FF）は除く。
create or replace function public.display_name_is_pictographic(p_cp integer)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select p_cp in (0x00A9, 0x00AE, 0x203C, 0x2049, 0x2122, 0x2139, 0x24C2, 0x3030, 0x303D, 0x3297, 0x3299)
    or p_cp between 0x2190 and 0x21FF
    or p_cp between 0x2300 and 0x23FF
    or p_cp between 0x25A0 and 0x27BF
    or p_cp between 0x2934 and 0x2935
    or p_cp between 0x2B00 and 0x2BFF
    or (p_cp between 0x1F000 and 0x1FFFD
        and not p_cp between 0x1F1E6 and 0x1F1FF
        and not p_cp between 0x1F3FB and 0x1F3FF);
$$;

comment on function public.display_name_is_pictographic(integer) is
  'SPEC §9.18-1（0015）: 表示名の ZWJ の前後に置ける絵文字か（Extended_Pictographic を含む代表的な範囲）。内部関数。';

-- 1-2. 文字（Letter）とみなすもの。記号・数字・句読点・空白・書式文字・絵文字・異体字セレクタ・タグ文字の
--      代表的な範囲を除いたもの（Unicode の Letter はすべて含む。結合文字も含むが、アプリより緩い側なのでよい）。
create or replace function public.display_name_is_letter(p_cp integer)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select not (
    p_cp <= 0x0040
    or p_cp between 0x005B and 0x0060
    or p_cp between 0x007B and 0x00A9
    or p_cp between 0x00AB and 0x00B4
    or p_cp between 0x00B6 and 0x00B9
    or p_cp between 0x00BB and 0x00BF
    or p_cp in (0x00D7, 0x00F7)
    or p_cp between 0x0660 and 0x066D
    or p_cp between 0x06F0 and 0x06F9
    or p_cp between 0x2000 and 0x206F
    or p_cp between 0x20A0 and 0x20CF
    or p_cp between 0x2190 and 0x2BFF
    or p_cp between 0x3000 and 0x3004
    or p_cp between 0x3007 and 0x3020
    or p_cp in (0x3030, 0x303D)
    or p_cp between 0xFE00 and 0xFE0F
    or p_cp = 0xFEFF
    or p_cp between 0xFF01 and 0xFF20
    or p_cp between 0xFF3B and 0xFF40
    or p_cp between 0xFF5B and 0xFF65
    or p_cp between 0x1F000 and 0x1FFFF
    or p_cp between 0xE0000 and 0xE0FFF
  );
$$;

comment on function public.display_name_is_letter(integer) is
  'SPEC §9.18-1（0015）: 表示名の ZWNJ の前後に置ける文字（Letter）か（記号・数字などの代表的な範囲を除く）。内部関数。';

-- 1-3. 見えない文字（見える文字に数えない）: 空白・制御文字・書式文字（Cf すべて）・結合文字の代表的な範囲・
--      異体字セレクタ・ハングルの埋め字・点字の空白。
create or replace function public.display_name_is_invisible(p_cp integer)
returns boolean
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select p_cp <= 0x0020
    or p_cp between 0x007F and 0x00A0
    or p_cp in (0x00AD, 0x061C, 0x06DD, 0x070F, 0x08E2, 0x1680, 0x180E, 0x2028, 0x2029, 0x202F, 0x205F,
                0x3000, 0xFEFF, 0x110BD, 0x110CD, 0xE0001,
                0x115F, 0x1160, 0x3164, 0xFFA0, 0x2800)
    or p_cp between 0x0600 and 0x0605
    or p_cp between 0x0890 and 0x0891
    or p_cp between 0x2000 and 0x200F
    or p_cp between 0x202A and 0x202E
    or p_cp between 0x2060 and 0x2064
    or p_cp between 0x2066 and 0x206F
    or p_cp between 0xFFF9 and 0xFFFB
    or p_cp between 0x13430 and 0x1343F
    or p_cp between 0x1BCA0 and 0x1BCA3
    or p_cp between 0x1D173 and 0x1D17A
    or p_cp between 0xE0020 and 0xE007F
    or p_cp between 0x0300 and 0x036F
    or p_cp between 0x1AB0 and 0x1AFF
    or p_cp between 0x1DC0 and 0x1DFF
    or p_cp between 0x20D0 and 0x20FF
    or p_cp between 0xFE20 and 0xFE2F
    or p_cp between 0x180B and 0x180F
    or p_cp between 0xFE00 and 0xFE0F
    or p_cp between 0xE0100 and 0xE01EF;
$$;

comment on function public.display_name_is_invisible(integer) is
  'SPEC §9.18-1（0015）: 表示名の「見える文字」に数えない文字か（空白・制御・書式・結合文字・異体字セレクタ・埋め字など）。内部関数。';

-- 1-4. 並びの検査。ZWJ・ZWNJ・タグ文字が正しい並びの外にあるか、見える文字が1つも無ければ true。
create or replace function public.display_name_has_invisible_sequence(p_text text)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $$
declare
  v_cps integer[];
  v_n integer;
  v_i integer := 1;
  v_j integer;
  v_cp integer;
  v_next integer;
  v_visible boolean := false;
begin
  v_n := pg_catalog.char_length(p_text);
  v_cps := array(
    select pg_catalog.ascii(pg_catalog.substr(p_text, g.i, 1))
    from pg_catalog.generate_series(1, v_n) as g(i)
    order by g.i
  );

  while v_i <= v_n loop
    v_cp := v_cps[v_i];
    v_next := coalesce(v_cps[v_i + 1], -1);

    -- 黒旗 ＋ タグ列（1文字以上）＋ 終端。終端が無ければ不可。
    if v_cp = 0x1F3F4 and v_next between 0xE0020 and 0xE007E then
      v_j := v_i + 1;
      while v_j <= v_n and v_cps[v_j] between 0xE0020 and 0xE007E loop
        v_j := v_j + 1;
      end loop;
      if coalesce(v_cps[v_j], -1) <> 0xE007F then
        return true;
      end if;
      v_visible := true;
      v_i := v_j + 1;
      continue;
    end if;

    -- 黒旗の地域旗の外にあるタグ文字は不可。
    if v_cp between 0xE0020 and 0xE007F then
      return true;
    end if;

    if v_cp = 0x200D then
      -- 前: 肌の色の修飾子・VS16・地域旗のタグ列（終端から黒旗まで）を遡って絵文字。後: 絵文字。
      v_j := v_i - 1;
      if coalesce(v_cps[v_j], -1) = 0xE007F then
        v_j := v_j - 1;
        while v_j >= 1 and v_cps[v_j] between 0xE0020 and 0xE007E loop
          v_j := v_j - 1;
        end loop;
      end if;
      while v_j >= 1 and (v_cps[v_j] = 0xFE0F or v_cps[v_j] between 0x1F3FB and 0x1F3FF) loop
        v_j := v_j - 1;
      end loop;
      if v_j < 1 or not public.display_name_is_pictographic(v_cps[v_j])
         or v_next = -1 or not public.display_name_is_pictographic(v_next) then
        return true;
      end if;
    elsif v_cp = 0x200C then
      -- 前: 結合文字を遡って文字。後: 文字。
      v_j := v_i - 1;
      while v_j >= 1 and (v_cps[v_j] between 0x0300 and 0x036F
                          or v_cps[v_j] between 0x064B and 0x065F
                          or v_cps[v_j] = 0x0670) loop
        v_j := v_j - 1;
      end loop;
      if v_j < 1 or not public.display_name_is_letter(v_cps[v_j])
         or v_next = -1 or not public.display_name_is_letter(v_next) then
        return true;
      end if;
    elsif not public.display_name_is_invisible(v_cp) then
      v_visible := true;
    end if;

    v_i := v_i + 1;
  end loop;

  return not v_visible;
end;
$$;

comment on function public.display_name_has_invisible_sequence(text) is
  'SPEC §9.18-1（0015、R22 重要2）: ZWJ・ZWNJ・タグ文字が正しい並びの外にあるか、見える文字が1つも無いか。src/lib/domain/display-name.ts と同じ規則（絵文字・文字は代表的な範囲）。内部関数。';

-- 1-5. set_display_name（0014）に並びの検査を足す。制御文字の検査の後、メールアドレスの形の前（アプリと同じ順）。
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
  -- 0015（R22 重要2）: ZWJ・ZWNJ・タグ文字の並びと、見える文字が1つはあること。
  if public.display_name_has_invisible_sequence(v_name) then
    raise exception '表示名に見えない文字は使えません' using errcode = '22023';
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
  'SPEC §9.18-1: 本人の表示名を変える（1〜20文字・改行や制御文字なし・見えない文字なし〈ZWNJ・ZWJ・タグ文字は正しい並びの中だけ可。見える文字が1つは必要〉・メールアドレスの形なし）。保存した名前を返す。';

-- =========================================================
-- 2. 退会の記録
-- =========================================================

-- 2-1. 表。auth.users への外部キーは付けない（消したアカウントの ID を残すための表なので）。
create table if not exists public.account_deletion_log (
  user_id uuid primary key,
  deleted_at timestamptz not null default now()
);

comment on table public.account_deletion_log is
  'R22 決定事項（0015、SPEC §9.17）: 退会（delete_account）で消したアカウントの ID と日時。バックアップから戻したときに reapply_account_deletions() で再び削除するため。退会から30日（バックアップの保存期間）を過ぎたら日次の cron が消す。運営だけが扱う。';

alter table public.account_deletion_log enable row level security;
-- 利用者からは読めず書けない（ポリシーを作らない＋権限も与えない）。service_role は読むだけ（書くのは関数）。
revoke all on table public.account_deletion_log from public, anon, authenticated, service_role;
grant select on table public.account_deletion_log to service_role;

-- 2-2. delete_account（0014）が記録を書く。同じアカウントを（戻した後などに）もう一度消したら、日時を新しい方にする。
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

  -- 0015（R22 決定事項）: バックアップから戻したときに再び削除できるよう、記録を残す。
  insert into public.account_deletion_log as l (user_id, deleted_at)
  values (p_user_id, now())
  on conflict (user_id) do update set deleted_at = greatest(l.deleted_at, excluded.deleted_at);
end;
$$;

comment on function public.delete_account(uuid) is
  'R21 決定事項（0014）・R22（0015）: 退会。auth.users を削除し、cascade でそのアカウントの投稿・承認・確認・栞・台帳・問い合わせまで消し、account_deletion_log に記録する。service_role のみ。';

-- 2-3. バックアップから戻した後に、記録にあるアカウントを再び削除する。消した件数を返す。
--      記録は戻した DB のものを使う。戻す前の DB の記録（戻したバックアップより後の退会）は、
--      運営が戻した DB の account_deletion_log に入れてから呼ぶ（docs/DEPLOY.md）。
create or replace function public.reapply_account_deletions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from auth.users u
    using public.account_deletion_log l
    where u.id = l.user_id
    returning u.id
  )
  select count(*)::integer into v_count from deleted;
  return v_count;
end;
$$;

comment on function public.reapply_account_deletions() is
  'R22 決定事項（0015、SPEC §9.17）: バックアップから戻した後に、account_deletion_log にあるアカウントを再び削除する（cascade は delete_account と同じ）。消した件数を返す。service_role のみ。';

-- 2-4. 退会から30日（バックアップの保存期間）を過ぎた記録を消す。消した件数を返す。
create or replace function public.purge_expired_account_deletion_log()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with deleted as (
    delete from public.account_deletion_log l
    where l.deleted_at < now() - interval '30 days'
    returning l.user_id
  )
  select count(*)::integer into v_count from deleted;
  return v_count;
end;
$$;

comment on function public.purge_expired_account_deletion_log() is
  'R22 決定事項（0015、SPEC §9.17）: 退会から30日を過ぎた account_deletion_log を消し、件数を返す。日次の cron が呼ぶ。service_role のみ。';

-- =========================================================
-- 3. 関数の EXECUTE
--   reapply_account_deletions / purge_expired_account_deletion_log / delete_account: service_role のみ
--   set_display_name: authenticated のみ（0014 と同じ）
--   display_name_*: 誰にも与えない（内部関数）
-- =========================================================
revoke all on function public.display_name_is_pictographic(integer) from public, anon, authenticated, service_role;
revoke all on function public.display_name_is_letter(integer) from public, anon, authenticated, service_role;
revoke all on function public.display_name_is_invisible(integer) from public, anon, authenticated, service_role;
revoke all on function public.display_name_has_invisible_sequence(text) from public, anon, authenticated, service_role;
revoke all on function public.set_display_name(text) from public, anon, authenticated, service_role;
revoke all on function public.delete_account(uuid) from public, anon, authenticated, service_role;
revoke all on function public.reapply_account_deletions() from public, anon, authenticated, service_role;
revoke all on function public.purge_expired_account_deletion_log() from public, anon, authenticated, service_role;

grant execute on function public.set_display_name(text) to authenticated;
grant execute on function public.delete_account(uuid) to service_role;
grant execute on function public.reapply_account_deletions() to service_role;
grant execute on function public.purge_expired_account_deletion_log() to service_role;
