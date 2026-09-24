-- 0013_contact_privacy_requests.sql（docs/SPEC.md §9.17-4、最終レビュー R20 重要3）を検証する pgTAP テスト。
--   個人情報の請求（privacy）は、ログイン中（requester_id あり）か、返信先（reply_to）があれば受け付ける。
--   どちらも無ければ拒否する。検査の順序（返信先の形の誤りが先）、関数の権限、
--   退会（auth.users の削除）で requester_id が NULL になっても問い合わせの行が残ることを確かめる。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

-- =========================================================
-- テストデータ（postgres として作成）
-- =========================================================
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('44440000-0000-4000-8000-000000000013', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'privacy-13@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name) values
  ('44440000-0000-4000-8000-000000000013', '請求テスト');

-- =========================================================
-- 関数の性質と権限（0010 から変えていない）
-- =========================================================
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_catalog.pg_proc p
   where p.oid = 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)'::regprocedure),
  'submit_contact_message は security definer で search_path を固定している'
);
select ok(
  not has_function_privilege('anon', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('public', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.submit_contact_message(text,text,text,uuid,text,uuid,text)', 'EXECUTE'),
  '権限表: submit_contact_message は service_role だけが実行できる'
);
select ok(
  not exists (
    select 1 from pg_catalog.pg_constraint c
    where c.conrelid = 'public.contact_messages'::regclass
      and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) like '%requester_id%'
  ),
  'contact_messages に requester_id を必須にする表の制約は無い（退会で NULL になっても行を残すため、検査は RPC だけ）'
);

-- =========================================================
-- privacy: 送信者も返信先も無ければ拒否する
-- =========================================================
set local role service_role;

select throws_ok(
  $$ select public.submit_contact_message('privacy', '情報を消してください', null, null, repeat('a', 64)) $$,
  '22023', 'ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。',
  'privacy: 送信者も返信先も無ければ拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('privacy', '情報を消してください', ' 　' || chr(10), null, repeat('a', 64)) $$,
  '22023', 'ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。',
  'privacy: 返信先が空白だけなら、無いものとして拒否する'
);
select throws_ok(
  $$ select public.submit_contact_message('privacy', '情報を消してください', 'a@@example.com', null, repeat('a', 64)) $$,
  '22023', 'メールアドレスの形をご確認ください',
  'privacy: 返信先の形の誤りを先に知らせる（画面・Server Action と同じ順序）'
);
select throws_ok(
  $$ select public.submit_contact_message('privacy', '　', null, null, repeat('a', 64)) $$,
  '22023', 'お問い合わせの内容を入力してください',
  'privacy: 本文が空なら、返信先より先に本文の誤りを知らせる'
);

-- =========================================================
-- privacy: ログインできない人・退会した人は、返信先があれば受け付ける
-- =========================================================
select isnt(
  public.submit_contact_message('privacy', '退会したので情報を消してください', ' former@example.com ', null, repeat('b', 64)),
  null::uuid,
  'privacy: 送信者が無くても返信先があれば受け付ける'
);
-- ログイン中は返信先が無くても受け付ける（0010 と同じ）。
select isnt(
  public.submit_contact_message('privacy', 'ログイン中の請求', null, null, repeat('c', 64), '44440000-0000-4000-8000-000000000013'),
  null::uuid,
  'privacy: 送信者があれば返信先が無くても受け付ける'
);
-- privacy 以外は、送信者も返信先も無くてよい（0010 と同じ）。
select isnt(
  public.submit_contact_message('other', '返信不要のご意見', null, null, repeat('d', 64)),
  null::uuid,
  'privacy 以外は送信者も返信先も無くてよい'
);

reset role;

select is(
  (select row(requester_id, reply_to)::text from contact_messages where message = '退会したので情報を消してください'),
  row(null::uuid, 'former@example.com')::text,
  '未ログインの請求は、送信者を NULL、返信先を前後の空白を除いて保存する'
);
select is(
  (select requester_id from contact_messages where message = 'ログイン中の請求'),
  '44440000-0000-4000-8000-000000000013'::uuid,
  'ログイン中の請求は送信者を保存する'
);

-- =========================================================
-- 退会（auth.users の削除）: 問い合わせの行は残り、送信者だけが NULL になる
-- =========================================================
select lives_ok(
  $$ delete from auth.users where id = '44440000-0000-4000-8000-000000000013' $$,
  '返信先の無い privacy の送信者でも、アカウントを削除できる'
);
select is(
  (select row(requester_id, category)::text from contact_messages where message = 'ログイン中の請求'),
  row(null::uuid, 'privacy')::text,
  '退会後も問い合わせの行は残り、送信者との結び付きだけが外れる（受付から1年を過ぎるまで）'
);

select * from finish();
rollback;
