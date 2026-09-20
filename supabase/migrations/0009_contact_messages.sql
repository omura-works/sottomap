-- 0009: お問い合わせの保存先（docs/SPEC.md §9.17）
--
-- ウラスポは実在の店を本人の許可なく載せているため、掲載停止の申し出を受ける窓口が要る。
-- メール送信の仕組み（SMTP）はまだ無いので、まずは DB に保存し、運営者が Supabase の画面
-- （service_role）で読む運用にする。
--
-- 方針（0006・0007 の書き方に合わせる）:
--   - 受け取った内容は利用者に一切見せない。anon / authenticated には表への select / insert /
--     update / delete を一切与えない（RLS を有効にしたうえでポリシーも作らない）。
--   - 書き込みは security definer の RPC `submit_contact_message` だけ（`search_path = ''`・スキーマ修飾）。
--   - EXECUTE は anon と authenticated（未ログインでも問い合わせできる）。

-- ---------------------------------------------------------
-- 1. 表
-- ---------------------------------------------------------
create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  category text not null check (category in ('removal', 'correction', 'other')),
  message text not null,
  reply_to text,
  spot_id uuid references public.spots (id) on delete set null,
  user_agent text,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done'))
);

comment on table public.contact_messages is
  'お問い合わせ（§9.17）。利用者には公開しない。書き込みは submit_contact_message だけ、読むのは service_role だけ。';
comment on column public.contact_messages.category is
  'removal=掲載を止めてほしい / correction=内容の訂正 / other=その他。';
comment on column public.contact_messages.status is
  '運営の対応状況。new=未対応 / in_progress=対応中 / done=対応済み。service_role（Supabase の画面）が更新する。';

create index if not exists contact_messages_created_at_idx
  on public.contact_messages (created_at desc);
-- 連投対策（同じ内容の直近1分以内）の照合に使う。
create index if not exists contact_messages_dedupe_idx
  on public.contact_messages (category, created_at desc);

alter table public.contact_messages enable row level security;
-- ポリシーは作らない（= anon / authenticated からは RLS でも権限でも到達できない）。

-- ---------------------------------------------------------
-- 2. 権限: 利用者（anon / authenticated / PUBLIC）からは取り上げる。運営（service_role）だけが読む。
-- ---------------------------------------------------------
revoke all on table public.contact_messages from public, anon, authenticated, service_role;
grant select, update, delete on table public.contact_messages to service_role;

-- ---------------------------------------------------------
-- 3. submit_contact_message: 問い合わせを1件受け取る（未ログインでも呼べる）。
--   戻り値: 保存したら その id。直近1分以内に同じ内容（category と message が同一）が
--           あれば新しい行を作らず null（二重送信の吸収。呼び出し側は成功として扱う）。
--   検査（DB が正本。画面・Server Action も同じ規則を実装する）:
--     - category は 'removal' / 'correction' / 'other'
--     - message は空白（全角空白・改行を含む）だけではないこと、2000字以内
--     - reply_to は null か 320字以内でメールらしい形（簡易検査。厳密な検証はしない）
--     - spot_id は null か、存在する published のスポット
--   user_agent は PostgREST が渡すリクエストヘッダから拾う（取れなければ null）。利用者は指定できない。
-- ---------------------------------------------------------
create or replace function public.submit_contact_message(
  p_category text,
  p_message text,
  p_reply_to text default null,
  p_spot_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message text := coalesce(p_message, '');
  -- 空白の除去文字は本文の検査と揃える（全角空白・改行を含む）。
  v_reply_to text := nullif(
    btrim(coalesce(p_reply_to, ''), ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(12288)),
    ''
  );
  v_user_agent text;
  v_existing uuid;
  v_id uuid;
begin
  if p_category is null or p_category not in ('removal', 'correction', 'other') then
    raise exception '用件を選んでください' using errcode = '22023';
  end if;

  -- 半角・全角の空白や改行だけの本文は受け付けない（btrim の除去文字を明示する）。
  if btrim(v_message, ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) || chr(12288)) = '' then
    raise exception 'お問い合わせの内容を入力してください' using errcode = '22023';
  end if;

  if char_length(v_message) > 2000 then
    raise exception 'お問い合わせの内容は2000字以内で入力してください' using errcode = '22023';
  end if;

  if v_reply_to is not null then
    if char_length(v_reply_to) > 320
      or strpos(v_reply_to, '@') < 2
      or strpos(v_reply_to, '@') = char_length(v_reply_to)
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

  -- 二重送信の吸収。同じ内容の同時送信でも1件に収まるよう、内容ごとの勧告ロックで直列化する
  -- （トランザクション終了で自動的に解放される）。
  perform pg_advisory_xact_lock(
    hashtextextended(p_category || chr(10) || v_message, 0)
  );

  select m.id into v_existing
  from public.contact_messages m
  where m.category = p_category
    and m.message = v_message
    and m.created_at > now() - interval '1 minute'
  limit 1;
  if v_existing is not null then
    return null;
  end if;

  -- 利用者の申告ではなく、PostgREST が渡すヘッダから拾う（無い・壊れている場合は null）。
  begin
    v_user_agent := left(
      nullif(current_setting('request.headers', true)::pg_catalog.jsonb ->> 'user-agent', ''),
      500
    );
  exception when others then
    v_user_agent := null;
  end;

  insert into public.contact_messages (category, message, reply_to, spot_id, user_agent)
  values (p_category, v_message, v_reply_to, p_spot_id, v_user_agent)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.submit_contact_message(text, text, text, uuid) is
  'お問い合わせの受付（§9.17）。検査に通れば1件保存して id を返す。直近1分以内の同じ内容は保存せず null を返す。';

revoke all on function public.submit_contact_message(text, text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.submit_contact_message(text, text, text, uuid) to anon, authenticated;
