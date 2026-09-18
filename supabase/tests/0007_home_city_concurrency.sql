-- set_home_city（docs/SPEC.md §9.16）の同時実行を2接続で検証する pgTAP テスト。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- しくみは 0006_concurrency.sql と同じ（dblink で setup / c1 / c2 の3接続。テストデータは setup でコミットし、最後に消す）。
-- 接続文字列も同じ規則（既定は postgres/postgres のローカル既定。`urasupo.test_dblink_connstr` で上書き可）。
--
-- シナリオ: 住んでいる街を一度も変えていない利用者 X（街 K1）が、2つの接続から同時に別の街へ変えようとする。
--   c1: K2 へ変更（X の行をロックしたままコミットしない）
--   c2: K3 へ変更を送る → c1 のロック待ちに入ったことを確認してから c1 をコミット
--   期待: c2 は c1 の変更を見て「90日に1回まで」で拒否される（行ロックが無いと2回とも変わってしまう）。

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(5);

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
-- 接続とテストデータ（街 K1 / K2 / K3、利用者 X は K1 在住・未変更）
-- =========================================================
do $$
begin
  perform extensions.dblink_connect('setup', pg_temp.connstr());
  perform extensions.dblink_connect('c1', pg_temp.connstr());
  perform extensions.dblink_connect('c2', pg_temp.connstr());
  perform pg_temp.exec('c1', $q$set lock_timeout = '10s'$q$);
  perform pg_temp.exec('c2', $q$set lock_timeout = '10s'$q$);
  insert into conc_pids (conn, pid)
  select 'c1', t.pid from extensions.dblink('c1', 'select pg_backend_pid()') as t(pid integer);
  insert into conc_pids (conn, pid)
  select 'c2', t.pid from extensions.dblink('c2', 'select pg_backend_pid()') as t(pid integer);

  -- 前回の失敗で残ったデータを消す
  perform pg_temp.exec('setup', $q$
    delete from auth.users where id = '44440000-0000-4000-8000-0000000000aa'
  $q$);
  perform pg_temp.exec('setup', $q$
    delete from public.cities where id in (
      '44440000-0000-4000-8000-000000000001',
      '44440000-0000-4000-8000-000000000002',
      '44440000-0000-4000-8000-000000000003'
    )
  $q$);

  perform pg_temp.exec('setup', $q$
    insert into public.cities (id, slug, name, name_kana, is_port, center_lat, center_lng) values
      ('44440000-0000-4000-8000-000000000001', 'hc-conc-1', '並行街1', 'へいこうまち1', false, 43.06, 141.35),
      ('44440000-0000-4000-8000-000000000002', 'hc-conc-2', '並行街2', 'へいこうまち2', false, 43.19, 140.99),
      ('44440000-0000-4000-8000-000000000003', 'hc-conc-3', '並行街3', 'へいこうまち3', false, 42.92, 143.20)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) values
      ('44440000-0000-4000-8000-0000000000aa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'hc-conc-x@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.users (id, display_name, home_city_id, lantern_points) values
      ('44440000-0000-4000-8000-0000000000aa', '並行X', '44440000-0000-4000-8000-000000000001', 0)
  $q$);
end;
$$;

-- =========================================================
-- 同時に2回変えようとする
-- =========================================================
do $$
begin
  -- c1: K2 へ変更（コミットしない＝ X の行ロックを持ったまま）
  perform pg_temp.begin_as_user('c1', '44440000-0000-4000-8000-0000000000aa');
  perform extensions.dblink_send_query('c1', $q$
    select to_jsonb(public.set_home_city('44440000-0000-4000-8000-000000000002'))
  $q$);
  perform pg_temp.collect('c1', 'c1_change');

  -- c2: K3 へ変更を送る → c1 のロック待ちに入る
  perform pg_temp.begin_as_user('c2', '44440000-0000-4000-8000-0000000000aa');
  perform extensions.dblink_send_query('c2', $q$
    select to_jsonb(public.set_home_city('44440000-0000-4000-8000-000000000003'))
  $q$);
  insert into conc_flags (key, value) values ('c2_blocked', pg_temp.wait_blocked('c2', 'c1'));

  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'c2_change');
  perform pg_temp.exec('c2', 'rollback');
end;
$$;

select is(
  (select err from conc_results where key = 'c1_change'),
  null,
  '1本目の変更は成功する'
);
select ok(
  (select value from conc_flags where key = 'c2_blocked'),
  '同期点: 2本目は1本目の行ロックを待つ'
);
select ok(
  (select err from conc_results where key = 'c2_change') like '%住んでいる街は90日に1回まで変えられます%',
  '2本目は1本目の変更を見て「90日に1回まで」で拒否される'
);
select is(
  (select t.city from extensions.dblink('setup', $q$
    select home_city_id from public.users where id = '44440000-0000-4000-8000-0000000000aa'
  $q$) as t(city uuid)),
  '44440000-0000-4000-8000-000000000002'::uuid,
  '住んでいる街は1本目の変更（K2）だけが反映される'
);
select ok(
  (select t.changed_at from extensions.dblink('setup', $q$
    select home_city_changed_at from public.users where id = '44440000-0000-4000-8000-0000000000aa'
  $q$) as t(changed_at timestamptz)) is not null,
  '変更した時刻が記録される'
);

-- =========================================================
-- 後片付け
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    delete from auth.users where id = '44440000-0000-4000-8000-0000000000aa'
  $q$);
  perform pg_temp.exec('setup', $q$
    delete from public.cities where id in (
      '44440000-0000-4000-8000-000000000001',
      '44440000-0000-4000-8000-000000000002',
      '44440000-0000-4000-8000-000000000003'
    )
  $q$);
  perform extensions.dblink_disconnect('c1');
  perform extensions.dblink_disconnect('c2');
  perform extensions.dblink_disconnect('setup');
end;
$$;

select * from finish();

rollback;
