-- initialize_home_city（docs/SPEC.md §9.16-1、/start の初回設定）の同時実行を2接続で検証する pgTAP テスト。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- しくみは 0007_home_city_concurrency.sql と同じ（dblink で setup / c1 / c2 / c3 の接続。テストデータは setup でコミットし、最後に消す）。
-- 接続文字列も同じ規則（既定は postgres/postgres のローカル既定。`urasupo.test_dblink_connstr` で上書き可）。
--
-- シナリオ: 住んでいる街が未設定（NULL）の利用者 Y が、2つのタブの /start から同時に別の街で歩きはじめる。
--   c1: K2 で初回設定（Y の行をロックしたままコミットしない）
--   c2: K3 で初回設定を送る → c1 のロック待ちに入ったことを確認してから c1 をコミット
--   期待: c2 はロック後に c1 の設定を見て何もしない（false）。住んでいる街は K2 だけ、
--         home_city_changed_at は NULL のまま（「1回目の変更」として数えず、90日の制限もかからない）。
--   続けて c3 で /me の set_home_city（K3）を呼ぶと、制限を受けずに変えられる（確認後 rollback）。

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(8);

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

-- p_conn でトランザクションを始め、利用者 p_sub になりきる
create function pg_temp.begin_as_user(p_conn text, p_sub uuid) returns void
language plpgsql
as $$
begin
  perform extensions.dblink_exec(p_conn, 'begin');
  perform extensions.dblink_exec(p_conn, 'set local role authenticated');
  perform extensions.dblink_exec(
    p_conn,
    format('set local request.jwt.claims to %L', jsonb_build_object('sub', p_sub, 'role', 'authenticated')::text)
  );
end;
$$;

create temp table conc_results (
  key text primary key,
  value jsonb,
  err text
);

-- 送った問い合わせ（jsonb 1列）の結果を受け取って保存する（相手側のエラーは例外にせず err に残す）
create function pg_temp.collect(p_conn text, p_key text) returns void
language plpgsql
as $$
declare
  v_value jsonb;
  v_err text;
begin
  select t.r into v_value from extensions.dblink_get_result(p_conn, false) as t(r jsonb);
  v_err := extensions.dblink_error_message(p_conn);
  perform 1 from extensions.dblink_get_result(p_conn, false) as t(r jsonb);
  insert into conc_results (key, value, err)
  values (p_key, v_value, nullif(nullif(v_err, 'OK'), ''));
end;
$$;

create temp table conc_pids (
  conn text primary key,
  pid integer not null
);

-- 同期点: p_waiter が p_blocker にブロックされてロック待ちに入るまで待つ（最大10秒）。
create function pg_temp.wait_blocked(p_waiter text, p_blocker text) returns boolean
language plpgsql
as $$
declare
  v_waiter integer := (select pid from conc_pids where conn = p_waiter);
  v_blocker integer := (select pid from conc_pids where conn = p_blocker);
  v_deadline timestamptz := clock_timestamp() + interval '10 seconds';
begin
  loop
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

create temp table conc_flags (
  key text primary key,
  value boolean not null
);

-- =========================================================
-- 接続とテストデータ（街 K1 / K2 / K3、利用者 Y は住んでいる街が未設定）
-- =========================================================
do $$
begin
  perform extensions.dblink_connect('setup', pg_temp.connstr());
  perform extensions.dblink_connect('c1', pg_temp.connstr());
  perform extensions.dblink_connect('c2', pg_temp.connstr());
  perform extensions.dblink_connect('c3', pg_temp.connstr());
  perform pg_temp.exec('c1', $q$set lock_timeout = '10s'$q$);
  perform pg_temp.exec('c2', $q$set lock_timeout = '10s'$q$);
  perform pg_temp.exec('c3', $q$set lock_timeout = '10s'$q$);
  insert into conc_pids (conn, pid)
  select 'c1', t.pid from extensions.dblink('c1', 'select pg_backend_pid()') as t(pid integer);
  insert into conc_pids (conn, pid)
  select 'c2', t.pid from extensions.dblink('c2', 'select pg_backend_pid()') as t(pid integer);

  -- 前回の失敗で残ったデータを消す
  perform pg_temp.exec('setup', $q$
    delete from auth.users where id = '45450000-0000-4000-8000-0000000000bb'
  $q$);
  perform pg_temp.exec('setup', $q$
    delete from public.cities where id in (
      '45450000-0000-4000-8000-000000000001',
      '45450000-0000-4000-8000-000000000002',
      '45450000-0000-4000-8000-000000000003'
    )
  $q$);

  perform pg_temp.exec('setup', $q$
    insert into public.cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
      ('45450000-0000-4000-8000-000000000001', 'hc-init-conc-1', '初回並行街1', 'しょかいへいこうまち1', false, 43.06, 141.35),
      ('45450000-0000-4000-8000-000000000002', 'hc-init-conc-2', '初回並行街2', 'しょかいへいこうまち2', false, 43.19, 140.99),
      ('45450000-0000-4000-8000-000000000003', 'hc-init-conc-3', '初回並行街3', 'しょかいへいこうまち3', false, 42.92, 143.20)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) values
      ('45450000-0000-4000-8000-0000000000bb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-init-conc-y@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.users (id, display_name, home_city_id, lantern_points) values
      ('45450000-0000-4000-8000-0000000000bb', '初回並行Y', null, 0)
  $q$);
end;
$$;

-- =========================================================
-- 2つのタブから同時に初回設定しようとする
-- =========================================================
do $$
begin
  -- c1: K2 で初回設定（コミットしない＝ Y の行ロックを持ったまま）
  perform pg_temp.begin_as_user('c1', '45450000-0000-4000-8000-0000000000bb');
  perform extensions.dblink_send_query('c1', $q$
    select to_jsonb(public.initialize_home_city('45450000-0000-4000-8000-000000000002'))
  $q$);
  perform pg_temp.collect('c1', 'c1_init');

  -- c2: K3 で初回設定を送る → c1 のロック待ちに入る
  perform pg_temp.begin_as_user('c2', '45450000-0000-4000-8000-0000000000bb');
  perform extensions.dblink_send_query('c2', $q$
    select to_jsonb(public.initialize_home_city('45450000-0000-4000-8000-000000000003'))
  $q$);
  insert into conc_flags (key, value) values ('c2_blocked', pg_temp.wait_blocked('c2', 'c1'));

  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'c2_init');
  perform pg_temp.exec('c2', 'commit');
end;
$$;

select is(
  (select value from conc_results where key = 'c1_init'),
  'true'::jsonb,
  '1本目の初回設定は成功する（true）'
);
select ok(
  (select value from conc_flags where key = 'c2_blocked'),
  '同期点: 2本目は1本目の行ロックを待つ'
);
select is(
  (select err from conc_results where key = 'c2_init'),
  null,
  '2本目は例外にならない'
);
select is(
  (select value from conc_results where key = 'c2_init'),
  'false'::jsonb,
  '2本目はロック後に1本目の設定を見て、何もしない（false）'
);
select is(
  (select t.city from extensions.dblink('setup', $q$
    select home_city_id from public.users where id = '45450000-0000-4000-8000-0000000000bb'
  $q$) as t(city uuid)),
  '45450000-0000-4000-8000-000000000002'::uuid,
  '住んでいる街は1本目の初回設定（K2）だけが反映される'
);
select is(
  (select t.changed_at from extensions.dblink('setup', $q$
    select home_city_changed_at from public.users where id = '45450000-0000-4000-8000-0000000000bb'
  $q$) as t(changed_at timestamptz)),
  null::timestamptz,
  '2本目は「1回目の変更」として数えない（home_city_changed_at は NULL のまま）'
);

-- 90日の制限がかかっていないこと: 続けて /me の set_home_city で別の街へ変えられる（確認後 rollback）
do $$
begin
  perform pg_temp.begin_as_user('c3', '45450000-0000-4000-8000-0000000000bb');
  perform extensions.dblink_send_query('c3', $q$
    select to_jsonb(public.set_home_city('45450000-0000-4000-8000-000000000003'))
  $q$);
  perform pg_temp.collect('c3', 'c3_change');
  perform pg_temp.exec('c3', 'rollback');
end;
$$;

select is(
  (select err from conc_results where key = 'c3_change'),
  null,
  '初回設定の直後でも、/me から別の街へ変えられる（90日の制限がかからない）'
);
select ok(
  coalesce((select value from conc_results where key = 'c3_change') <> 'null'::jsonb, false),
  '/me からの変更は「1回目の変更」として時刻を記録する'
);

-- =========================================================
-- 後片付け
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    delete from auth.users where id = '45450000-0000-4000-8000-0000000000bb'
  $q$);
  perform pg_temp.exec('setup', $q$
    delete from public.cities where id in (
      '45450000-0000-4000-8000-000000000001',
      '45450000-0000-4000-8000-000000000002',
      '45450000-0000-4000-8000-000000000003'
    )
  $q$);
  perform extensions.dblink_disconnect('c1');
  perform extensions.dblink_disconnect('c2');
  perform extensions.dblink_disconnect('c3');
  perform extensions.dblink_disconnect('setup');
end;
$$;

select * from finish();

rollback;
