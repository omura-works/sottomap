-- 0010: お問い合わせの濫用対策・送信者の記録・保存期間（docs/SPEC.md §9.17、R19 レビュー重要1・3・4・5・6、軽微）
--
-- 0009 では submit_contact_message を anon / authenticated が直接実行でき、Server Action 側で何を
-- 足しても公開 RPC を直接呼べば迂回できた。ここで次のように改める。
--   1. RPC の EXECUTE は service_role だけ。Server Action がサーバー専用の service_role 接続で呼ぶ。
--   2. 送信元ごとの永続的な回数制限（public.contact_rate。IP そのものは保存せず、ソルト付きハッシュだけ）。
--      1時間に5件・1日に20件／送信元、全体で1日に500件。
--   3. 容量の上限: contact_messages が 10,000 件に達したら新規を受け付けない（運営が整理するまで）。
--   4. 重複排除の鍵: category + message + spot_id + reply_to + requester_id + source_hash が同じで、
--      直近1分以内のものだけ。
--   5. 送信者の記録: requester_id（ログイン中の利用者）と、Server Action が渡すブラウザの User-Agent。
--   6. 個人情報の請求用の区分 'privacy'。requester_id が無ければ受け付けない（本人確認のため）。
--   7. 返信先メールアドレスの検査を強める。
--   8. 保存期間: 問い合わせは受付から1年、contact_rate は24時間で削除（purge_expired_contact_data）。

-- ---------------------------------------------------------
-- 1. contact_messages の列と区分
-- ---------------------------------------------------------
alter table public.contact_messages
  add column if not exists requester_id uuid references auth.users (id) on delete set null;

comment on column public.contact_messages.requester_id is
  '送信時にログインしていた利用者（auth.users.id）。未ログインなら NULL。privacy（個人情報の請求）では必須（RPC が検査）。';
comment on column public.contact_messages.user_agent is
  'ブラウザの User-Agent（Server Action がリクエストヘッダーから読み取り、200字で切って渡す）。';

alter table public.contact_messages
  drop constraint if exists contact_messages_category_check;
alter table public.contact_messages
  add constraint contact_messages_category_check
  check (category in ('removal', 'correction', 'privacy', 'other'));

comment on column public.contact_messages.category is
  'removal=掲載を止めてほしい / correction=内容の訂正 / privacy=自分の個人情報について（開示・訂正・削除・利用停止） / other=その他。';

-- ---------------------------------------------------------
-- 2. contact_rate: 送信元ごとの受付記録（回数制限と重複排除に使う。24時間で削除）
--   source_hash は sha256(送信元IP + CONTACT_RATE_SALT) の16進64文字。IP そのものは保存しない。
-- ---------------------------------------------------------
create table if not exists public.contact_rate (
  id bigint generated always as identity primary key,
  source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  message_id uuid references public.contact_messages (id) on delete set null
);

comment on table public.contact_rate is
  'お問い合わせの送信元ごとの受付記録（§9.17）。回数制限と重複排除の照合に使い、24時間で purge_expired_contact_data が削除する。';

create index if not exists contact_rate_source_created_idx
  on public.contact_rate (source_hash, created_at desc);
create index if not exists contact_rate_created_at_idx
  on public.contact_rate (created_at);
create index if not exists contact_rate_message_id_idx
  on public.contact_rate (message_id);

alter table public.contact_rate enable row level security;
-- ポリシーは作らない。書き込み・削除は security definer の関数だけが行う。
revoke all on table public.contact_rate from public, anon, authenticated, service_role;

-- ---------------------------------------------------------
-- 3. submit_contact_message（署名を変えるため、旧版を削除して作り直す）
-- ---------------------------------------------------------
drop function if exists public.submit_contact_message(text, text, text, uuid);

-- 戻り値: 保存したら その id。直近1分以内に同じ送信（重複排除の鍵が同一）があれば保存せず null。
-- 検査の順序と拒否文言は src/app/contact/schema.ts と同じ。
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

  -- 個人情報の請求は、本人確認のためログイン中の利用者からだけ受け付ける。
  if p_category = 'privacy' and p_requester_id is null then
    raise exception 'ログインしてから送ってください。本人確認のためです。' using errcode = '42501';
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

comment on function public.submit_contact_message(text, text, text, uuid, text, uuid, text) is
  'お問い合わせの受付（§9.17）。service_role 専用（Server Action がサーバーから呼ぶ）。回数制限・容量・重複排除を判定し、保存したら id、重複なら null を返す。';

revoke all on function public.submit_contact_message(text, text, text, uuid, text, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_contact_message(text, text, text, uuid, text, uuid, text) to service_role;

-- ---------------------------------------------------------
-- 4. purge_expired_contact_data: 保存期間を過ぎたものを削除する（日次 cron の最後に呼ぶ）
--   問い合わせは受付から1年ちょうどで削除、contact_rate は24時間ちょうどで削除。
-- ---------------------------------------------------------
create or replace function public.purge_expired_contact_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rates integer;
  v_messages integer;
begin
  delete from public.contact_rate r where r.created_at <= now() - interval '24 hours';
  get diagnostics v_rates = row_count;

  delete from public.contact_messages m where m.created_at <= now() - interval '1 year';
  get diagnostics v_messages = row_count;

  return jsonb_build_object('deletedMessages', v_messages, 'deletedRates', v_rates);
end;
$$;

comment on function public.purge_expired_contact_data() is
  '保存期間（§9.17）を過ぎたお問い合わせ（受付から1年）と contact_rate（24時間）を削除する。service_role 専用。';

revoke all on function public.purge_expired_contact_data() from public, anon, authenticated, service_role;
grant execute on function public.purge_expired_contact_data() to service_role;
