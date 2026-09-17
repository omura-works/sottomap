-- 0006_security_hardening.sql の同時実行（docs/SPEC.md §9.13.7・§9.13.8）を2接続で検証する pgTAP テスト。
--
-- 実行方法（Docker Desktop と Supabase CLI が必要）:
--   npx supabase start
--   npx supabase db reset
--   npx supabase test db
--
-- しくみ:
--   - dblink で自分自身の DB に接続を3本張る（setup: 自動コミットでデータを作る / c1・c2: 競合させる2接続）。
--     別接続から見えるよう、テストデータは setup 接続でコミットし、最後に削除する（固定の UUID）。
--   - c1・c2 では `begin` → `set local role ...` → `set local request.jwt.claims ...` で利用者・cron になりきる。
--   - 待ちが発生する操作は dblink_send_query で非同期に送り、相手のコミット後に dblink_get_result で受け取る。
--   - 同期点: 2本目を送った後、「2本目が1本目の接続にブロックされてロック待ちに入った」ことを
--     pg_locks（granted = false）・pg_blocking_pids・pg_stat_activity（wait_event_type = 'Lock'）で
--     ポーリングして確認してから1本目をコミットする（最大10秒。確認できなければ該当のアサーションが失敗する）。
--     これで、スケジューリング次第で直列に実行されて通ってしまうことを防ぐ。
--   - dblink の接続文字列は、既定で `host=<このセッションのサーバー側アドレス> port=<port> dbname=<現在のDB>
--     user=postgres password=postgres`（Supabase のローカル既定。本番の秘密ではない）。
--     postgres は非スーパーユーザーなので、dblink は「実際にパスワード認証を使った接続」しか許さない。
--     ローカルの Supabase コンテナは 127.0.0.1 が trust 認証（パスワードを使わない）ため、
--     scram 認証になるコンテナのネットワークアドレス（inet_server_addr()）へ接続する。
--     違う場合は DB の設定 `urasupo.test_dblink_connstr` で上書きする:
--       alter database postgres set urasupo.test_dblink_connstr = 'host=... user=... password=...';
--
-- 注意:
--   - run_verification_cron は DB 全体を処理するため、seed のデータにも期限処理が走ってコミットされる。
--     テスト後に seed を元に戻したいときは `npx supabase db reset` をやり直す。
--   - シナリオ (c) は期限（created_at + 30日）をまたぐため、期限を「承認側トランザクションの開始時刻 + 2秒」に置き、
--     DB の時計がそれを過ぎるまで待つ（約2.5秒）。期限は開始時刻から決めるので、負荷で遅れても前提は崩れない。

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(28);

-- =========================================================
-- 補助関数（このセッション限り）
-- =========================================================
create function pg_temp.connstr() returns text
language sql
as $$
  select coalesce(
    nullif(current_setting('urasupo.test_dblink_connstr', true), ''),
    format(
      'host=%s port=%s dbname=%s user=postgres password=postgres',
      coalesce(
        case when inet_server_addr() is not null and not host(inet_server_addr()) in ('127.0.0.1', '::1')
          then host(inet_server_addr()) end,
        '127.0.0.1'
      ),
      current_setting('port'),
      current_database()
    )
  );
$$;

create function pg_temp.exec(p_conn text, p_sql text) returns void
language plpgsql
as $$
begin
  perform extensions.dblink_exec(p_conn, p_sql);
end;
$$;

-- 同じトランザクションのまま、利用者（または cron）になりきる
create function pg_temp.switch_role(p_conn text, p_role text, p_sub uuid) returns void
language plpgsql
as $$
begin
  perform extensions.dblink_exec(p_conn, format('set local role %I', p_role));
  perform extensions.dblink_exec(
    p_conn,
    format(
      'set local request.jwt.claims to %L',
      case
        when p_sub is null then jsonb_build_object('role', p_role)
        else jsonb_build_object('sub', p_sub, 'role', p_role)
      end::text
    )
  );
end;
$$;

create function pg_temp.begin_as(p_conn text, p_role text, p_sub uuid) returns void
language plpgsql
as $$
begin
  perform extensions.dblink_exec(p_conn, 'begin');
  if p_role is not null then
    perform pg_temp.switch_role(p_conn, p_role, p_sub);
  end if;
end;
$$;

-- 非同期に送る（結果は jsonb 1列の問い合わせに限る）
create function pg_temp.send(p_conn text, p_sql text) returns void
language plpgsql
as $$
begin
  perform extensions.dblink_send_query(p_conn, p_sql);
end;
$$;

create temp table conc_results (
  key text primary key,
  value jsonb,
  err text
);

-- 送った問い合わせの結果を受け取って保存する（相手側のエラーは例外にせず err に残す）
create function pg_temp.collect(p_conn text, p_key text) returns void
language plpgsql
as $$
declare
  v_value jsonb;
  v_err text;
begin
  select t.r into v_value from extensions.dblink_get_result(p_conn, false) as t(r jsonb);
  v_err := extensions.dblink_error_message(p_conn);
  -- 次の問い合わせを送れるよう、空の結果まで読み切る
  perform 1 from extensions.dblink_get_result(p_conn, false) as t(r jsonb);
  insert into conc_results (key, value, err)
  values (p_key, v_value, nullif(nullif(v_err, 'OK'), ''));
end;
$$;

create function pg_temp.res(p_key text) returns jsonb
language sql
as $$ select value from conc_results where key = p_key $$;

create function pg_temp.err(p_key text) returns text
language sql
as $$ select err from conc_results where key = p_key $$;

-- 接続ごとのバックエンド PID
create temp table conc_pids (
  conn text primary key,
  pid integer not null
);

create function pg_temp.pid_of(p_conn text) returns integer
language sql
as $$ select pid from conc_pids where conn = p_conn $$;

-- 同期点: p_waiter の接続が p_blocker の接続にブロックされてロック待ちに入るまで待つ。
-- 確認できたら true。p_timeout を過ぎたら false（p_waiter の問い合わせが先に終わってしまった場合も false）。
create function pg_temp.wait_blocked(p_waiter text, p_blocker text, p_timeout interval default '10 seconds')
returns boolean
language plpgsql
as $$
declare
  v_waiter integer := pg_temp.pid_of(p_waiter);
  v_blocker integer := pg_temp.pid_of(p_blocker);
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    -- pg_stat_activity はトランザクション内でスナップショットされるので毎回捨てる
    perform pg_stat_clear_snapshot();
    if exists (select 1 from pg_locks l where l.pid = v_waiter and not l.granted)
       and v_blocker = any (pg_blocking_pids(v_waiter))
       and exists (
         select 1 from pg_stat_activity a
         where a.pid = v_waiter and a.state = 'active' and a.wait_event_type = 'Lock'
       )
    then
      return true;
    end if;
    if clock_timestamp() > v_deadline or extensions.dblink_is_busy(p_waiter) = 0 then
      return false;
    end if;
    perform pg_sleep(0.05);
  end loop;
end;
$$;

-- 同期点: 非同期に送った問い合わせが（コミット前に）結果を返すまで待つ。
create function pg_temp.wait_done(p_conn text, p_timeout interval default '10 seconds')
returns boolean
language plpgsql
as $$
declare
  v_deadline timestamptz := clock_timestamp() + p_timeout;
begin
  loop
    if extensions.dblink_is_busy(p_conn) = 0 then
      return true;
    end if;
    if clock_timestamp() > v_deadline then
      return false;
    end if;
    perform pg_sleep(0.05);
  end loop;
end;
$$;

create function pg_temp.flag(p_key text, p_value boolean) returns void
language sql
as $$ insert into conc_results (key, value) values (p_key, to_jsonb(p_value)) $$;

create function pg_temp.flagged(p_key text) returns boolean
language sql
as $$ select coalesce((select (value #>> '{}')::boolean from conc_results where key = p_key), false) $$;

-- =========================================================
-- 接続とテストデータ
--   街 T、投稿者 U、同じ街の住人 B / C / E
-- =========================================================
do $$
begin
  perform extensions.dblink_connect('setup', pg_temp.connstr());
  perform extensions.dblink_connect('c1', pg_temp.connstr());
  perform extensions.dblink_connect('c2', pg_temp.connstr());
  perform pg_temp.exec('c1', $q$set lock_timeout = '10s'$q$);
  perform pg_temp.exec('c2', $q$set lock_timeout = '10s'$q$);
  perform pg_temp.exec('c1', $q$set statement_timeout = '60s'$q$);
  perform pg_temp.exec('c2', $q$set statement_timeout = '60s'$q$);
  insert into conc_pids (conn, pid)
  select 'c1', t.pid from extensions.dblink('c1', 'select pg_backend_pid()') as t(pid integer);
  insert into conc_pids (conn, pid)
  select 'c2', t.pid from extensions.dblink('c2', 'select pg_backend_pid()') as t(pid integer);

  -- 前回の失敗で残ったデータを消す
  perform pg_temp.exec('setup', $q$
    delete from auth.users where id in (
      '55550000-0000-4000-8000-0000000000aa',
      '55550000-0000-4000-8000-0000000000bb',
      '55550000-0000-4000-8000-0000000000cc',
      '55550000-0000-4000-8000-0000000000ee'
    )
  $q$);
  perform pg_temp.exec('setup', $q$
    delete from public.cities where id = '55550000-0000-4000-8000-000000000001'
  $q$);

  perform pg_temp.exec('setup', $q$
    insert into public.cities (id, slug, name, name_kana, is_port, center_lat, center_lng)
    values ('55550000-0000-4000-8000-000000000001', 'conc-test-city', '並行テスト街', 'へいこうてすとまち', false, 43.06, 141.35)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) values
      ('55550000-0000-4000-8000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-u@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
      ('55550000-0000-4000-8000-0000000000bb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-b@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
      ('55550000-0000-4000-8000-0000000000cc', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-c@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false),
      ('55550000-0000-4000-8000-0000000000ee', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'conc-e@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.users (id, display_name, home_city_id, area_name, resident_years, lantern_points) values
      ('55550000-0000-4000-8000-0000000000aa', '並行U', '55550000-0000-4000-8000-000000000001', '北', 10, 0),
      ('55550000-0000-4000-8000-0000000000bb', '並行B', '55550000-0000-4000-8000-000000000001', '南', 5, 0),
      ('55550000-0000-4000-8000-0000000000cc', '並行C', '55550000-0000-4000-8000-000000000001', '東', 3, 0),
      ('55550000-0000-4000-8000-0000000000ee', '並行E', '55550000-0000-4000-8000-000000000001', '西', 2, 0)
  $q$);
end;
$$;

-- =========================================================
-- (a) 旧実装の循環待ち（final-review-A2 重要3・R3 重要1）
--   同じ投稿者 U のスポット P（期限内に2人承認済みの pending）と Q（published、open 依頼 RQ は due から91日経過）。
--   旧実装で起きた循環: cron が P と users(U) を保持したまま Q を待つ ／ 回答が Q を保持して users(U) を待つ。
--   手順: c2 が Q をロック → c1 で cron を送る → c2 で U として Q の依頼に回答を送る。
--   旧実装: cron は Q 待ちで止まり（同期点1が失敗）、回答が users(U) を待った時点で循環し 40P01 になる。
--   新実装: cron は Q を飛ばして（コミット前に）完了し、P と users(U) を保持したまま残る。
--           回答は Q を保持したまま users(U) 待ちに入る（同期点2: 両方が同時に進行中）。
--           cron をコミットすると回答が進み、どちらもエラーにならない。
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    insert into public.spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
      ('66660000-0000-4000-8000-00000000000a', '55550000-0000-4000-8000-000000000001', 'P', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '55550000-0000-4000-8000-0000000000aa', 'pending',   now() - interval '31 days', null),
      ('66660000-0000-4000-8000-00000000000b', '55550000-0000-4000-8000-000000000001', 'Q', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '55550000-0000-4000-8000-0000000000aa', 'published', now() - interval '300 days', now() - interval '290 days')
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.endorsements (spot_id, user_id, created_at) values
      ('66660000-0000-4000-8000-00000000000a', '55550000-0000-4000-8000-0000000000bb', now() - interval '30 days'),
      ('66660000-0000-4000-8000-00000000000a', '55550000-0000-4000-8000-0000000000cc', now() - interval '29 days')
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.verification_requests (id, spot_id, user_id, due_at, status, created_at) values
      ('77770000-0000-4000-8000-00000000000b', '66660000-0000-4000-8000-00000000000b', '55550000-0000-4000-8000-0000000000aa', now() - interval '91 days', 'open', now() - interval '181 days')
  $q$);

  -- 1. c2（postgres のまま）が Q をロックする（回答がスポット行を取った状態を再現）
  perform pg_temp.begin_as('c2', null, null);
  perform pg_temp.send('c2', $q$
    select to_jsonb(s.id) from public.spots s where s.id = '66660000-0000-4000-8000-00000000000b' for update
  $q$);
  perform pg_temp.collect('c2', 'a_lock_q');

  -- 2. c1（service_role）で cron を送る。P を公開して users(U) をロックし、Q は飛ばす。
  --    同期点1: Q を c2 が持ったままでも、cron の問い合わせが（コミット前に）エラーなく終わる。
  --    待つのは5秒まで（c1 の lock_timeout 10秒より短くし、旧実装の「Q 待ち」がタイムアウトで終わった場合と区別する）。
  perform pg_temp.begin_as('c1', 'service_role', null);
  perform pg_temp.send('c1', $q$ select public.run_verification_cron() $q$);
  perform pg_temp.flag('a_cron_done_while_q_locked', pg_temp.wait_done('c1', '5 seconds'));

  -- 3. c2 が U として Q の依頼に回答する（Q は保持済み。users(U) は cron が保持しているので待つ）
  --    同期点2: 回答が c1 にブロックされてロック待ちに入る（cron は未コミットで P・users(U) を保持）。
  perform pg_temp.switch_role('c2', 'authenticated', '55550000-0000-4000-8000-0000000000aa');
  perform pg_temp.send('c2', $q$
    select public.answer_verification('77770000-0000-4000-8000-00000000000b', 'quiet', null)
  $q$);
  perform pg_temp.flag('a_answer_waited_on_cron', pg_temp.wait_blocked('c2', 'c1'));

  -- 4. cron の結果を受け取ってコミット → 回答が進む
  --    （旧実装ではここで循環が検出され、どちらかが 40P01 になる）
  perform pg_temp.collect('c1', 'a_cron');
  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'a_answer');
  perform pg_temp.exec('c2', 'commit');
end;
$$;

select ok(pg_temp.flagged('a_cron_done_while_q_locked'), '(a) 同期点: cron は Q のロックを待たずに（コミット前に）終わる');
select ok(pg_temp.flagged('a_answer_waited_on_cron'), '(a) 同期点: 回答は未コミットの cron にブロックされて users(U) 待ちに入る（両方が同時に進行中）');
select is(pg_temp.err('a_cron'), null, '(a) cron はロック待ち・デッドロック（40P01）なしで完了する');
select cmp_ok(
  coalesce((pg_temp.res('a_cron') ->> 'skippedLockedCount')::int, 0), '>=', 1,
  '(a) cron はロック中の Q を飛ばして skippedLockedCount に数える'
);
select is(pg_temp.err('a_answer'), null, '(a) 同時の回答もデッドロック（40P01）なしで完了する');
select is((pg_temp.res('a_answer') ->> 'accepted')::boolean, true, '(a) 回答は受理される');
select is(
  (select array_agg(s.status || ':' || s.quietness order by s.name) from public.spots s
   where s.id in ('66660000-0000-4000-8000-00000000000a', '66660000-0000-4000-8000-00000000000b')),
  array['published:quiet', 'published:quiet'],
  '(a) P は公開、Q は published のまま（cron に missed にされず回答が反映）'
);
select is(
  (select lantern_points from public.users where id = '55550000-0000-4000-8000-0000000000aa'),
  15,
  '(a) U のポイントは公開 +10 と確認 +5 の合計'
);

-- =========================================================
-- (b) 同じ依頼への同時回答: 受理と +5 は1回だけ
--   c1 が回答して（スポット行を保持したまま）止まり、c2 の回答がスポット行のロック待ちに入ってから c1 をコミットする。
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    insert into public.spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
      ('66660000-0000-4000-8000-00000000000c', '55550000-0000-4000-8000-000000000001', 'R', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '55550000-0000-4000-8000-0000000000aa', 'published', now() - interval '120 days', now() - interval '110 days')
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.verification_requests (id, spot_id, user_id, due_at, status, created_at) values
      ('77770000-0000-4000-8000-00000000000c', '66660000-0000-4000-8000-00000000000c', '55550000-0000-4000-8000-0000000000aa', now() - interval '1 day', 'open', now() - interval '91 days')
  $q$);

  perform pg_temp.begin_as('c1', 'authenticated', '55550000-0000-4000-8000-0000000000aa');
  perform pg_temp.send('c1', $q$
    select public.answer_verification('77770000-0000-4000-8000-00000000000c', 'crowding', null)
  $q$);
  perform pg_temp.collect('c1', 'b1');

  perform pg_temp.begin_as('c2', 'authenticated', '55550000-0000-4000-8000-0000000000aa');
  perform pg_temp.send('c2', $q$
    select public.answer_verification('77770000-0000-4000-8000-00000000000c', 'quiet', null)
  $q$);
  -- 同期点: c2 が c1 のロック待ちに入ったことを確認してからコミットする
  perform pg_temp.flag('b_waited', pg_temp.wait_blocked('c2', 'c1'));

  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'b2');
  perform pg_temp.exec('c2', 'commit');
end;
$$;

select ok(pg_temp.flagged('b_waited'), '(b) 同期点: 後の回答は先の回答のロック待ちに入る');
select is((pg_temp.res('b1') ->> 'pointsAwarded')::int, 5, '(b) 先の回答は受理されて +5');
select is(
  (pg_temp.res('b2') ->> 'accepted')::boolean || coalesce(':' || pg_temp.err('b2'), ''),
  'false',
  '(b) 後の回答はエラーにならず、受理されない'
);
select is(
  (select count(*)::int from public.lantern_events
   where kind = 'verification' and source_id = '77770000-0000-4000-8000-00000000000c'),
  1,
  '(b) 台帳の確認 +5 は1件だけ'
);
select is(
  (select count(*)::int from public.verifications
   where verification_request_id = '77770000-0000-4000-8000-00000000000c'),
  1,
  '(b) 確認履歴は1行だけ'
);
select is(
  (select lantern_points from public.users where id = '55550000-0000-4000-8000-0000000000aa'),
  20,
  '(b) U のポイントは +5 が1回だけ増える'
);

-- =========================================================
-- (c) 期限直前の2人目の承認と cron: 公開が勝つ（§9.13.5）
--   c1（C）がトランザクションを開始し、その開始時刻 T（c1 の now()）を受け取る。
--   X は期限（created_at + 30日）が T + 2秒の pending（B の承認1件。承認時刻は T）。
--   DB の時計が期限を過ぎてから cron（c2）が X を expired にしてロックを保持する。
--   c1 の承認は cron のロック待ちに入り、cron のコミット後に進む。c1 の DB 時刻（T）は期限前なので公開になる。
--   期限は T から決めるため、負荷で各手順が遅れても「承認側は期限前に開始」の前提は崩れない。
-- =========================================================
do $$
declare
  v_begin timestamptz;
  v_deadline timestamptz;
  v_wait_until timestamptz;
begin
  -- 1. c1 を開始し、開始時刻（now() はこの時刻に固定される）を受け取る
  perform pg_temp.begin_as('c1', 'authenticated', '55550000-0000-4000-8000-0000000000cc');
  perform pg_temp.send('c1', $q$ select to_jsonb(now()) $q$);
  perform pg_temp.collect('c1', 'c_begin');
  v_begin := (pg_temp.res('c_begin') #>> '{}')::timestamptz;
  v_deadline := v_begin + interval '2 seconds';

  perform pg_temp.exec('setup', format($q$
    insert into public.spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
      ('66660000-0000-4000-8000-00000000000d', '55550000-0000-4000-8000-000000000001', 'X', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '55550000-0000-4000-8000-0000000000aa', 'pending', %L::timestamptz - interval '30 days', null)
  $q$, v_deadline));
  perform pg_temp.exec('setup', format($q$
    insert into public.endorsements (spot_id, user_id, created_at) values
      ('66660000-0000-4000-8000-00000000000d', '55550000-0000-4000-8000-0000000000bb', %L::timestamptz)
  $q$, v_begin));

  -- 2. DB の時計が期限を過ぎるまで待つ（余裕 0.5 秒）
  v_wait_until := v_deadline + interval '500 milliseconds';
  while clock_timestamp() < v_wait_until loop
    perform pg_sleep(0.1);
  end loop;

  -- 3. cron が X を expired にしてロックを保持する（cron の now() は期限後）
  perform pg_temp.begin_as('c2', 'service_role', null);
  perform pg_temp.send('c2', $q$ select public.run_verification_cron() $q$);
  perform pg_temp.collect('c2', 'c_cron');

  -- 4. c1 が承認する（X のロック待ち）
  perform pg_temp.send('c1', $q$
    select public.endorse_spot('66660000-0000-4000-8000-00000000000d')
  $q$);
  -- 同期点: 承認が cron のロック待ちに入ったことを確認してからコミットする
  perform pg_temp.flag('c_waited', pg_temp.wait_blocked('c1', 'c2'));

  -- 5. cron をコミット → 承認が進む
  perform pg_temp.exec('c2', 'commit');
  perform pg_temp.collect('c1', 'c_endorse');
  perform pg_temp.exec('c1', 'commit');
end;
$$;

select ok(
  (pg_temp.res('c_begin') #>> '{}')::timestamptz
    < (select created_at + interval '30 days' from public.spots where id = '66660000-0000-4000-8000-00000000000d'),
  '(c) 前提: 承認側のトランザクションは期限前に始まっている'
);
select ok(pg_temp.flagged('c_waited'), '(c) 同期点: 承認は期限後の cron（未コミット）のロック待ちに入る');
select is(pg_temp.err('c_cron'), null, '(c) cron はエラーなく完了する');
select is(
  coalesce(pg_temp.res('c_endorse') ->> 'status', pg_temp.err('c_endorse')),
  'published',
  '(c) cron の後に進んだ2人目の承認（期限前の DB 時刻）で公開になる'
);
select is(
  (select status from public.spots where id = '66660000-0000-4000-8000-00000000000d'),
  'published',
  '(c) X の最終状態は published'
);
select is(
  (select count(*)::int from public.lantern_events
   where kind = 'publish' and source_id = '66660000-0000-4000-8000-00000000000d'),
  1,
  '(c) 公開 +10 は台帳に1件だけ'
);
select is(
  (select lantern_points from public.users where id = '55550000-0000-4000-8000-0000000000aa'),
  30,
  '(c) U のポイントは公開 +10 が1回だけ増える'
);

-- =========================================================
-- (d) 同時承認2人: 公開と +10 は1回だけ
--   Y は B の承認1件を持つ pending。C（c1）と E（c2）が同時に承認する。
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    insert into public.spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
      ('66660000-0000-4000-8000-00000000000e', '55550000-0000-4000-8000-000000000001', 'Y', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '55550000-0000-4000-8000-0000000000aa', 'pending', now(), null)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.endorsements (spot_id, user_id) values
      ('66660000-0000-4000-8000-00000000000e', '55550000-0000-4000-8000-0000000000bb')
  $q$);

  perform pg_temp.begin_as('c1', 'authenticated', '55550000-0000-4000-8000-0000000000cc');
  perform pg_temp.send('c1', $q$
    select public.endorse_spot('66660000-0000-4000-8000-00000000000e')
  $q$);
  perform pg_temp.collect('c1', 'd1');

  perform pg_temp.begin_as('c2', 'authenticated', '55550000-0000-4000-8000-0000000000ee');
  perform pg_temp.send('c2', $q$
    select public.endorse_spot('66660000-0000-4000-8000-00000000000e')
  $q$);
  -- 同期点: c2 が c1 のロック待ちに入ったことを確認してからコミットする
  perform pg_temp.flag('d_waited', pg_temp.wait_blocked('c2', 'c1'));

  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'd2');
  -- 後の承認は「公開済みには承認できない」でエラーになり、トランザクションは中断状態
  perform pg_temp.exec('c2', 'rollback');
end;
$$;

select ok(pg_temp.flagged('d_waited'), '(d) 同期点: 後の承認は先の承認のロック待ちに入る');
select is(pg_temp.res('d1') ->> 'status', 'published', '(d) 先の承認（2人目）で公開になる');
select ok(
  pg_temp.res('d2') is null and pg_temp.err('d2') like '%承認を受け付けていません%',
  '(d) 後の承認は公開済みとして受け付けられない（二重の公開なし）'
);
select is(
  (select status from public.spots where id = '66660000-0000-4000-8000-00000000000e'),
  'published',
  '(d) Y の最終状態は published'
);
select is(
  (select count(*)::int from public.lantern_events
   where kind = 'publish' and source_id = '66660000-0000-4000-8000-00000000000e'),
  1,
  '(d) 公開 +10 は台帳に1件だけ'
);
select is(
  (select count(*)::int from public.verification_requests
   where spot_id = '66660000-0000-4000-8000-00000000000e' and status = 'open'),
  1,
  '(d) 次の確認依頼は1件だけ'
);
select is(
  (select lantern_points from public.users where id = '55550000-0000-4000-8000-0000000000aa'),
  40,
  '(d) U のポイントは公開 +10 が1回だけ増える'
);

-- =========================================================
-- 後片付け（コミット済みのテストデータを消す）
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    delete from auth.users where id in (
      '55550000-0000-4000-8000-0000000000aa',
      '55550000-0000-4000-8000-0000000000bb',
      '55550000-0000-4000-8000-0000000000cc',
      '55550000-0000-4000-8000-0000000000ee'
    )
  $q$);
  perform pg_temp.exec('setup', $q$
    delete from public.cities where id = '55550000-0000-4000-8000-000000000001'
  $q$);
  perform extensions.dblink_disconnect('c1');
  perform extensions.dblink_disconnect('c2');
  perform extensions.dblink_disconnect('setup');
end;
$$;

select * from finish();

rollback;
