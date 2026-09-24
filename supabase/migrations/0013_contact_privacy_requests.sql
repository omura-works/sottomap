-- 0013: 個人情報の請求の受付経路（docs/SPEC.md §9.17-4、最終レビュー R20 重要3）
--
-- 0010 の submit_contact_message は、privacy（個人情報の請求）を requester_id（ログイン中の利用者）が
-- 無ければ拒否していた。これではログインできない人・退会した人が請求できない（退会後も問い合わせの記録は
-- 受付から1年を過ぎるまで残るのに、その開示・削除を求める経路が無い）。ここで次のように改める。
--   - privacy は、requester_id か reply_to（前後の空白を除いて空でない返信先）のどちらかがあれば受け付ける。
--     どちらも無ければ「ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。」
--     （errcode 22023）。本人確認は、運営が返信先（登録している／していた メールアドレス）宛にメールで行う。
--   - 検査の順序: 用件 → 本文（空）→ 本文（長さ）→ 返信先の形 → privacy の送信者か返信先 → 対象の店
--     （src/app/contact/schema.ts の validateContactMessageInput と同じ）。
--   - 署名・戻り値・権限（EXECUTE は service_role だけ）・回数制限・重複排除は 0010 のまま。
--
-- 表の制約（check）では強制しない。requester_id は auth.users の削除で NULL になる（on delete set null）ため、
-- 制約にすると、返信先の無い privacy を送った利用者のアカウントを削除できなくなる。

create or replace function public.submit_contact_message(
  p_category text,
  p_message text,
  p_reply_to text,
  p_spot_id uuid,
  p_source_hash text,
  p_requester_id uuid default null,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- 前後の空白として除く文字（半角・全角の空白と改行類）。
  v_blank text := ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(12288);
  -- 返信先の中に含めてはいけない空白・改行・制御文字（src/app/contact/schema.ts の EMAIL_FORBIDDEN と同じ集合）。
  v_forbidden text := '[' || chr(1) || '-' || chr(32) || chr(127) || '-' || chr(160) || chr(5760)
    || chr(8192) || '-' || chr(8203) || chr(8232) || chr(8233) || chr(8239) || chr(8287)
    || chr(12288) || chr(65279) || ']';
  v_message text := coalesce(p_message, '');
  v_reply_to text;
  v_domain text;
  v_user_agent text := nullif(left(coalesce(p_user_agent, ''), 200), '');
  v_existing uuid;
  v_id uuid;
begin
  if p_category is null or p_category not in ('removal', 'correction', 'privacy', 'other') then
    raise exception '用件を選んでください' using errcode = '22023';
  end if;

  if btrim(v_message, v_blank) = '' then
    raise exception 'お問い合わせの内容を入力してください' using errcode = '22023';
  end if;

  if char_length(v_message) > 2000 then
    raise exception 'お問い合わせの内容は2000字以内で入力してください' using errcode = '22023';
  end if;

  v_reply_to := nullif(btrim(coalesce(p_reply_to, ''), v_blank), '');
  if v_reply_to is not null then
    v_domain := split_part(v_reply_to, '@', 2);
    if char_length(v_reply_to) > 320
      or v_reply_to ~ v_forbidden
      or char_length(v_reply_to) - char_length(replace(v_reply_to, '@', '')) <> 1
      or split_part(v_reply_to, '@', 1) = ''
      or v_domain = ''
      or strpos(v_domain, '.') = 0
    then
      raise exception 'メールアドレスの形をご確認ください' using errcode = '22023';
    end if;
  end if;

  -- 個人情報の請求は、ログイン中（そのアカウントのご本人として受け付ける）か、返信先があること。
  -- ログインできない人・退会した人は返信先を必須にし、運営がそのアドレス宛にメールで確認して本人確認する。
  if p_category = 'privacy' and p_requester_id is null and v_reply_to is null then
    raise exception 'ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。'
      using errcode = '22023';
  end if;

  if p_spot_id is not null then
    if not exists (
      select 1 from public.spots s where s.id = p_spot_id and s.status = 'published'
    ) then
      raise exception 'お店の情報が取得できませんでした' using errcode = 'P0002';
    end if;
  end if;

  if p_source_hash is null or p_source_hash !~ '^[0-9a-f]{64}$' then
    raise exception '送信元を確認できませんでした' using errcode = '22023';
  end if;

  -- 回数制限・容量・重複排除の判定と記録を1つずつ直列に行う（トランザクション終了で解放）。
  perform pg_advisory_xact_lock(hashtextextended('urasupo:submit_contact_message', 0));

  -- 二重送信の吸収（同じ送信元から、同じ鍵の送信が直近1分以内にあれば保存しない）。
  select m.id into v_existing
  from public.contact_rate r
  join public.contact_messages m on m.id = r.message_id
  where r.source_hash = p_source_hash
    and r.created_at > now() - interval '1 minute'
    and m.created_at > now() - interval '1 minute'
    and m.category = p_category
    and m.message = v_message
    and m.spot_id is not distinct from p_spot_id
    and m.reply_to is not distinct from v_reply_to
    and m.requester_id is not distinct from p_requester_id
  limit 1;
  if v_existing is not null then
    return null;
  end if;

  -- 容量の上限（運営が古いものを整理するまで新規を受け付けない）。
  if (select count(*) from public.contact_messages) >= 10000 then
    raise exception 'しばらく時間をおいてから送ってください。'
      using errcode = 'P0001', hint = 'contact_capacity';
  end if;

  -- 送信元ごとの回数制限と、全体の1日の上限。
  if (
    select count(*) from public.contact_rate r
    where r.source_hash = p_source_hash and r.created_at > now() - interval '1 hour'
  ) >= 5
  or (
    select count(*) from public.contact_rate r
    where r.source_hash = p_source_hash and r.created_at > now() - interval '1 day'
  ) >= 20
  then
    raise exception 'しばらく時間をおいてから送ってください。'
      using errcode = 'P0001', hint = 'contact_rate_source';
  end if;

  if (
    select count(*) from public.contact_rate r where r.created_at > now() - interval '1 day'
  ) >= 500 then
    raise exception 'しばらく時間をおいてから送ってください。'
      using errcode = 'P0001', hint = 'contact_rate_global';
  end if;

  insert into public.contact_messages (category, message, reply_to, spot_id, user_agent, requester_id)
  values (p_category, v_message, v_reply_to, p_spot_id, v_user_agent, p_requester_id)
  returning id into v_id;

  insert into public.contact_rate (source_hash, message_id)
  values (p_source_hash, v_id);

  return v_id;
end;
$$;

comment on column public.contact_messages.requester_id is
  '送信時にログインしていた利用者（auth.users.id）。未ログインなら NULL（退会でも NULL になり、行は残る）。privacy（個人情報の請求）は requester_id か reply_to のどちらかが必須（RPC が検査。0013）。';

comment on function public.submit_contact_message(text, text, text, uuid, text, uuid, text) is
  'お問い合わせの受付（§9.17）。service_role 専用（Server Action がサーバーから呼ぶ）。privacy は送信者か返信先のどちらかが必須（0013）。回数制限・容量・重複排除を判定し、保存したら id、重複なら null を返す。';

-- create or replace は既存の権限を保つが、0010 と同じ権限を明示しておく。
revoke all on function public.submit_contact_message(text, text, text, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_contact_message(text, text, text, uuid, text, uuid, text) to service_role;
