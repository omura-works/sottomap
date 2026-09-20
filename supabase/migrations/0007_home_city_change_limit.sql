-- 0007: 住んでいる街（users.home_city_id）の変更制限（docs/SPEC.md §9.16）
--
-- 見る街と住んでいる街を分ける。住んでいる街は「ピンを立てられる街」「地元として確認できる街」を決めるため、
-- 利用者が表を直接書き換えられないようにし、DB 関数 set_home_city / initialize_home_city だけで変える。
--   - 初回（NULL → 街）は制限に数えない（home_city_changed_at は NULL に戻す）。
--   - 同じ街は何もしない。
--   - 別の街への変更は90日に1回まで（home_city_changed_at が NULL か90日以上前のときだけ）。
-- 0006 の方針（search_path = ''、スキーマ修飾、明示 GRANT、anon へは付与しない）に合わせる。

-- ---------------------------------------------------------
-- 1. 列の追加: 最後に（初回設定を除いて）住んでいる街を変えた時刻。NULL = まだ変えていない。
-- ---------------------------------------------------------
alter table public.users add column if not exists home_city_changed_at timestamptz;

comment on column public.users.home_city_changed_at is
  '住んでいる街を最後に変えた時刻（初回設定は数えない）。NULL = 未変更。set_home_city / initialize_home_city だけが書く（§9.16）。';

-- ---------------------------------------------------------
-- 2. 権限: authenticated から home_city_id の直接 insert / update を取り上げる。
--    初回設定（NULL → 街）も RPC（/start は initialize_home_city、/me は set_home_city）に統一する（プロフィール行の作成は id・表示名などだけ）。
--    home_city_changed_at は authenticated に一度も付与しない（読み取りは表単位の SELECT で可）。
-- ---------------------------------------------------------
revoke insert (home_city_id), update (home_city_id) on table public.users from authenticated;

-- ---------------------------------------------------------
-- 3. set_home_city: 住んでいる街を設定・変更する（本人のみ）。
--   本人の users 行を for update でロックしてから検査するため、同時に2回呼んでも2回は変わらない。
--   戻り値: 変更したときは記録した時刻（now()）。初回設定は NULL（home_city_changed_at も NULL に戻す）。同じ街なら現在の home_city_changed_at。
--   90日以内の変更は拒否し、次に変えられる日（Asia/Tokyo の日付。時刻の端数は翌日へ切り上げ）を
--   メッセージと HINT（ISO 8601 の時刻）で返す。
-- ---------------------------------------------------------
create or replace function public.set_home_city(p_city_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_current uuid;
  v_changed_at timestamptz;
  v_next timestamptz;
  v_next_local timestamp;
  v_next_date date;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  if p_city_id is null or not exists (select 1 from public.cities c where c.id = p_city_id) then
    raise exception '街の情報が取得できませんでした' using errcode = 'P0002';
  end if;

  select u.home_city_id, u.home_city_changed_at
    into v_current, v_changed_at
  from public.users u
  where u.id = v_uid
  for update;
  if not found then
    raise exception 'プロフィールが見つかりませんでした' using errcode = 'P0002';
  end if;

  -- 初回設定は制限に数えない。都市の削除（on delete set null）などで「街だけ NULL・日時あり」になった行でも、
  -- 古い制限が残らないよう home_city_changed_at を明示的に NULL に戻す。
  if v_current is null then
    update public.users
    set home_city_id = p_city_id,
        home_city_changed_at = null
    where id = v_uid;
    return null;
  end if;

  -- 同じ街は何もしない。
  if v_current = p_city_id then
    return v_changed_at;
  end if;

  if v_changed_at is not null and v_changed_at > v_now - interval '90 days' then
    v_next := v_changed_at + interval '90 days';
    v_next_local := v_next at time zone 'Asia/Tokyo';
    v_next_date := v_next_local::date + case when v_next_local::time > time '00:00' then 1 else 0 end;
    raise exception '住んでいる街は90日に1回まで変えられます。次に変えられるのは%以降です。',
      to_char(v_next_date, 'YYYY"年"FMMM"月"FMDD"日"')
      using errcode = 'P0001',
            hint = 'next_change_at=' || to_char(v_next at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  update public.users
  set home_city_id = p_city_id,
      home_city_changed_at = v_now
  where id = v_uid;
  return v_now;
end;
$$;

comment on function public.set_home_city(uuid) is
  '住んでいる街の設定・変更（§9.16）。初回は制限なし、同じ街は何もしない、別の街は90日に1回まで。';

-- ---------------------------------------------------------
-- 4. initialize_home_city: 住んでいる街の初回設定だけを行う（/start の「歩きはじめる」専用。本人のみ）。
--   「読んでから set_home_city を呼ぶ」と、2タブが同時に NULL を読んだとき後続が「1回目の変更」として
--   成立してしまう（別の街へ変わり、90日の制限もかかる）。そこで本人の users 行を for update でロックし、
--   ロックを取った後の値が NULL のときだけ設定する。
--   戻り値: 設定したら true。設定済みなら何もせず false（例外にしない）。
--   home_city_changed_at は NULL にする（初回設定は制限に数えない）。
--   未ログインは「ログインが必要です」、存在しない街は「街の情報が取得できませんでした」で拒否する。
--   プロフィール行が無い（本来ありえないデータ不整合）場合は「既に設定済み」と区別するため、
--   false ではなく「プロフィールが見つかりません」の例外にする（R14 軽微1）。呼び出し側
--   （saveHomeCityAction）はこの例外を捕まえて記録し、/start の「歩きはじめる」は妨げない。
-- ---------------------------------------------------------
create or replace function public.initialize_home_city(p_city_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_current uuid;
begin
  if v_uid is null then
    raise exception 'ログインが必要です' using errcode = '42501';
  end if;

  if p_city_id is null or not exists (select 1 from public.cities c where c.id = p_city_id) then
    raise exception '街の情報が取得できませんでした' using errcode = 'P0002';
  end if;

  select u.home_city_id
    into v_current
  from public.users u
  where u.id = v_uid
  for update;
  if not found then
    -- 「行が無い」と「既に設定済み」を同じ false に畳まない（R14 軽微1）。認証済みのはずの利用者に
    -- プロフィール行が無いのはデータ不整合であり、呼び出し側が検知・記録できるよう例外にする。
    raise exception 'プロフィールが見つかりません' using errcode = 'P0002';
  end if;
  -- 既に住んでいる街がある利用者は何もしない（/start から変えない。§9.16-1）。
  if v_current is not null then
    return false;
  end if;

  update public.users
  set home_city_id = p_city_id,
      home_city_changed_at = null
  where id = v_uid;
  return true;
end;
$$;

comment on function public.initialize_home_city(uuid) is
  '住んでいる街の初回設定（§9.16-1）。未設定のときだけ設定して true、設定済みなら何もせず false。制限に数えない。';

-- ---------------------------------------------------------
-- 5. EXECUTE は authenticated だけに明示する（PUBLIC / anon / service_role には与えない）。
-- ---------------------------------------------------------
revoke all on function public.set_home_city(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_home_city(uuid) to authenticated;
revoke all on function public.initialize_home_city(uuid) from public, anon, authenticated, service_role;
grant execute on function public.initialize_home_city(uuid) to authenticated;
