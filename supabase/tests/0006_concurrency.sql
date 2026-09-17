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
--     古い実装（cron がロック待ちする）ではロック待ちが lock_timeout（10秒）でエラーになり、テストが失敗する。
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
--   - シナリオ (c) は期限（created_at + 30日）をまたぐため、途中で4秒待つ。

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(23);

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
-- (a) Codex の交差シナリオ（final-review-A2 重要3）
--   同じ投稿者 U のスポット P（期限内に2人承認済みの pending）と Q（published、open 依頼 RQ は due から91日経過）。
--   c2 が Q をロック中に cron が P を公開（U の行もロック）し、Q を処理しようとする。
--   旧実装: cron が Q を待つ → c2 の回答が U を待つ → デッドロック（または lock_timeout）。
--   新実装: cron は Q を飛ばして完了し、c2 の回答は cron のコミット後に完了する。
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

  -- 2. c1（service_role）が cron を実行する。P を公開して U をロックし、Q は飛ばして完了するはず。
  perform pg_temp.begin_as('c1', 'service_role', null);
  perform pg_temp.send('c1', $q$ select public.run_verification_cron() $q$);
  perform pg_temp.collect('c1', 'a_cron');

  -- 3. c2 が U として Q の依頼に回答する（U の行は cron が保持しているので待つ）
  perform pg_temp.switch_role('c2', 'authenticated', '55550000-0000-4000-8000-0000000000aa');
  perform pg_temp.send('c2', $q$
    select public.answer_verification('77770000-0000-4000-8000-00000000000b', 'quiet', null)
  $q$);

  -- 4. cron をコミット → 回答が進む
  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'a_answer');
  perform pg_temp.exec('c2', 'commit');
end;
$$;

select is(pg_temp.err('a_cron'), null, '(a) cron はロック待ち・デッドロックなしで完了する');
select cmp_ok(
  coalesce((pg_temp.res('a_cron') ->> 'skippedLockedCount')::int, 0), '>=', 1,
  '(a) cron はロック中の Q を飛ばして skippedLockedCount に数える'
);
select is(pg_temp.err('a_answer'), null, '(a) 同時の回答もデッドロックなしで完了する');
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

  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'b2');
  perform pg_temp.exec('c2', 'commit');
end;
$$;

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
--   X は「今から3秒後」に期限を迎える pending（B の承認1件）。
--   c1（C）は期限前にトランザクションを開始し、期限後に cron（c2）が X を expired にしてロックを保持する。
--   c1 の承認は cron のコミットを待ってから進み、DB 時刻（c1 の開始時刻）が期限前なので公開になる。
-- =========================================================
do $$
begin
  perform pg_temp.exec('setup', $q$
    insert into public.spots (id, city_id, name, reason, visit_frequency, location, author_id, status, created_at, published_at) values
      ('66660000-0000-4000-8000-00000000000d', '55550000-0000-4000-8000-000000000001', 'X', '理由', 'weekly', 'SRID=4326;POINT(141.35 43.06)', '55550000-0000-4000-8000-0000000000aa', 'pending', clock_timestamp() - interval '30 days' + interval '3 seconds', null)
  $q$);
  perform pg_temp.exec('setup', $q$
    insert into public.endorsements (spot_id, user_id) values
      ('66660000-0000-4000-8000-00000000000d', '55550000-0000-4000-8000-0000000000bb')
  $q$);

  -- 1. c1 を期限前に開始する（now() はこの時刻に固定される）
  perform pg_temp.begin_as('c1', 'authenticated', '55550000-0000-4000-8000-0000000000cc');
  perform pg_temp.send('c1', $q$ select to_jsonb(now()) $q$);
  perform pg_temp.collect('c1', 'c_begin');

  -- 2. 期限を過ぎるまで待つ
  perform pg_sleep(4);

  -- 3. cron が X を expired にしてロックを保持する
  perform pg_temp.begin_as('c2', 'service_role', null);
  perform pg_temp.send('c2', $q$ select public.run_verification_cron() $q$);
  perform pg_temp.collect('c2', 'c_cron');

  -- 4. c1 が承認する（X のロック待ち）
  perform pg_temp.send('c1', $q$
    select public.endorse_spot('66660000-0000-4000-8000-00000000000d')
  $q$);

  -- 5. cron をコミット → 承認が進む
  perform pg_temp.exec('c2', 'commit');
  perform pg_temp.collect('c1', 'c_endorse');
  perform pg_temp.exec('c1', 'commit');
end;
$$;

select ok(
  (pg_temp.res('c_begin') #>> '{}')::timestamptz
    <= (select created_at + interval '30 days' from public.spots where id = '66660000-0000-4000-8000-00000000000d'),
  '(c) 前提: 承認側のトランザクションは期限前に始まっている'
);
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

  perform pg_temp.exec('c1', 'commit');
  perform pg_temp.collect('c2', 'd2');
  -- 後の承認は「公開済みには承認できない」でエラーになり、トランザクションは中断状態
  perform pg_temp.exec('c2', 'rollback');
end;
$$;

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
