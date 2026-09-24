-- 0016_display_name_server_only.sql（docs/SPEC.md §9.18-1・§9.17、最終レビュー R23 重要1・重要2）を検証する pgTAP テスト。
--
--   1. 表示名の変更はサーバー経由だけ: set_display_name(p_user_id uuid, p_name text) は service_role だけが実行できる
--      （anon・authenticated は不可）。旧 set_display_name(text) は無い。
--   2. 表示名の規則: src/lib/domain/display-name.cases.ts と同じ一覧を set_display_name に流し、アプリと同じ結果になる
--      （一覧が同じであることは src/lib/domain/display-name.test.ts が照合する）。
--   3. 問い合わせの個別削除 delete_contact_message(p_id uuid)（バックアップから戻したときの再適用にも使う）は service_role だけ。
--
-- 実行方法: npx supabase db reset → npx supabase test db
-- 見えない文字は chr() で作る（ファイルに直接書かない）。最後に rollback する（seed には影響しない）。

begin;

create extension if not exists pgtap with schema extensions;

select plan(76);

-- =========================================================
-- テストデータ（postgres として作成）。P: 表示名を変える人
-- =========================================================
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_sso_user
) values
  ('a4160000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'r23-p@example.invalid', null, now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false);

insert into users (id, display_name, lantern_points) values
  ('a4160000-0000-4000-8000-000000000001', 'R23P', 0);

insert into contact_messages (id, category, message, reply_to) values
  ('c4160000-0000-4000-8000-000000000001', 'other', 'R23: 個別に削除する問い合わせ', 'r23-guest@example.invalid'),
  ('c4160000-0000-4000-8000-000000000002', 'other', 'R23: 残す問い合わせ', null);

-- =========================================================
-- 1. 関数と権限
-- =========================================================
select has_function('public', 'set_display_name', array['uuid', 'text'], '関数 set_display_name(uuid, text) がある');
select hasnt_function('public', 'set_display_name', array['text'], '旧 set_display_name(text)（本人のセッションで呼ぶもの）は無い');
select has_function('public', 'delete_contact_message', array['uuid'], '関数 delete_contact_message(uuid) がある');
select has_function('public', 'display_name_is_visible', array['integer'], '関数 display_name_is_visible(integer) がある');
select hasnt_function('public', 'display_name_is_letter', array['integer'], '0015 の display_name_is_letter は無い（ZWNJ を全面禁止にしたので不要）');
select hasnt_function('public', 'display_name_is_invisible', array['integer'], '0015 の display_name_is_invisible は無い（display_name_is_visible に置き換え）');

select is_empty(
  $$
    with fns(fn, service_ok) as (values
      ('public.set_display_name(uuid, text)', true),
      ('public.delete_contact_message(uuid)', true),
      ('public.display_name_is_visible(integer)', false),
      ('public.display_name_is_pictographic(integer)', false),
      ('public.display_name_has_invisible_sequence(text)', false),
      ('public.contains_format_character(text)', false)
    )
    select f.fn, e.role_name
    from fns f
    cross join lateral (values
      ('public', false), ('anon', false), ('authenticated', false), ('service_role', f.service_ok)
    ) as e(role_name, allowed)
    where has_function_privilege(e.role_name, f.fn, 'EXECUTE') <> e.allowed
  $$,
  '権限表: set_display_name・delete_contact_message は service_role のみ、表示名の内部関数は誰にも実行させない'
);
select is(
  (select pg_catalog.array_agg(p.proname::text order by p.proname)
   from pg_catalog.pg_proc p
   where p.oid in ('public.set_display_name(uuid, text)'::regprocedure,
                   'public.delete_contact_message(uuid)'::regprocedure)
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  array['delete_contact_message', 'set_display_name'],
  'set_display_name・delete_contact_message は security definer・search_path 空'
);

-- 1-1. 利用者（authenticated・anon）は表示名を DB に直接送れない（RPC を直接呼んでアプリの検査を回避できない）。
set local role authenticated;
set local request.jwt.claims to '{"sub":"a4160000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.set_display_name('a4160000-0000-4000-8000-000000000001', 'ab' || chr(8204) || 'cd') $$,
  '42501', null, '本人（authenticated）は set_display_name を実行できない'
);
select throws_ok(
  $$ select public.delete_contact_message('c4160000-0000-4000-8000-000000000001') $$,
  '42501', null, '本人（authenticated）は delete_contact_message を実行できない'
);
reset role;

set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select public.set_display_name('a4160000-0000-4000-8000-000000000001', '灯り') $$,
  '42501', null, '未ログイン（anon）は set_display_name を実行できない'
);
reset role;

select is(
  (select display_name from users where id = 'a4160000-0000-4000-8000-000000000001'),
  'R23P',
  '利用者から直接は表示名を変えられない'
);

-- 1-2. 引数の検査（service_role）。
set local role service_role;
select throws_ok(
  $$ select public.set_display_name(null, '灯り') $$,
  '22023', 'アカウントを指定してください', 'set_display_name: アカウントの指定が無ければ不可'
);
select throws_ok(
  $$ select public.set_display_name('a4160000-0000-4000-8000-0000000000ff', '灯り') $$,
  'P0002', 'プロフィールが見つかりませんでした', 'set_display_name: プロフィールの無いアカウントは不可'
);
select is(
  public.set_display_name('a4160000-0000-4000-8000-000000000001', '  灯りの人　'),
  '灯りの人',
  'set_display_name: 前後の空白を除いて保存し、保存した名前を返す'
);
reset role;
select is(
  (select display_name from users where id = 'a4160000-0000-4000-8000-000000000001'),
  '灯りの人',
  'set_display_name: 指定したアカウントの表示名が変わる'
);

-- =========================================================
-- 2. 表示名の規則（アプリと同じ一覧。R23 重要1）
-- =========================================================
create function pg_temp.try_display_name(p_user_id uuid, p_code_points integer[])
returns text
language plpgsql
as $$
declare
  v_name text;
  v_saved text;
begin
  select pg_catalog.string_agg(pg_catalog.chr(u.cp), '' order by u.ord) into v_name
  from pg_catalog.unnest(p_code_points) with ordinality as u(cp, ord);
  v_saved := public.set_display_name(p_user_id, v_name);
  if v_saved = v_name then
    return 'ok';
  end if;
  return 'saved: ' || v_saved;
exception when others then
  return sqlerrm;
end;
$$;
-- 試験用の関数（postgres が作る）を service_role から呼べるようにする。set_display_name は service_role の権限で呼ばれる。
grant execute on function pg_temp.try_display_name(uuid, integer[]) to service_role;

set local role service_role;
select is(pg_temp.try_display_name('a4160000-0000-4000-8000-000000000001', c.code_points), c.expected, 'set_display_name: ' || c.label)
from (values
-- BEGIN display_name_cases（src/lib/domain/display-name.cases.ts と同じ。display-name.test.ts が照合する）
  (1, '普通の名前', array[28783, 12426, 12398, 20154]::integer[], 'ok'),
  (2, '記号だけの名前（U+2100）', array[8448]::integer[], 'ok'),
  (3, '家族の絵文字（ZWJ）', array[128104, 8205, 128105, 8205, 128103, 8205, 128102]::integer[], 'ok'),
  (4, '職業の絵文字（ZWJ）', array[129489, 8205, 127859]::integer[], 'ok'),
  (5, '肌の色を付けた職業の絵文字（修飾子の後の ZWJ）', array[129489, 127997, 8205, 128658]::integer[], 'ok'),
  (6, 'VS16 の後の ZWJ（レインボーフラッグ）', array[127987, 65039, 8205, 127752]::integer[], 'ok'),
  (7, 'ハートに火（VS16 の後の ZWJ）', array[10084, 65039, 8205, 128293, 12398, 20154]::integer[], 'ok'),
  (8, '異体字セレクタ付きの絵文字', array[28783, 12426, 10084, 65039]::integer[], 'ok'),
  (9, 'イングランドの旗', array[127988, 917607, 917602, 917605, 917614, 917607, 917631, 28783, 12426]::integer[], 'ok'),
  (10, 'スコットランドの旗を2つ並べる', array[127988, 917607, 917602, 917619, 917603, 917620, 917631, 127988, 917607, 917602, 917619, 917603, 917620, 917631]::integer[], 'ok'),
  (11, 'ウェールズの旗', array[127988, 917607, 917602, 917623, 917612, 917619, 917631]::integer[], 'ok'),
  (12, '黒旗だけ（タグ列なし）', array[127988]::integer[], 'ok'),
  (13, '肌の色の修飾子だけ', array[127997]::integer[], 'ok'),
  (14, '名前の中の空白（U+0020）', array[28783, 12426, 32, 12398, 20154]::integer[], 'ok'),
  (15, '結合文字の付いた文字', array[101, 769]::integer[], 'ok'),
  (16, 'ZWNJ だけ', array[8204]::integer[], '表示名に見えない文字は使えません'),
  (17, 'ZWNJ を含む名前（ペルシア語）', array[1605, 1740, 8204, 1582, 1608, 1575, 1607, 1605]::integer[], '表示名に見えない文字は使えません'),
  (18, 'ラテン文字の間の ZWNJ', array[97, 98, 8204, 99, 100]::integer[], '表示名に見えない文字は使えません'),
  (19, '記号の間の ZWNJ（U+2100 ZWNJ U+2100）', array[8448, 8204, 8448]::integer[], '表示名に見えない文字は使えません'),
  (20, 'ZWNJ と21文字（見えない文字を長さより先に調べる）', array[8204, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354]::integer[], '表示名に見えない文字は使えません'),
  (21, 'ZWJ だけ', array[8205]::integer[], '表示名に見えない文字は使えません'),
  (22, 'ZWJ と ZWNJ だけ', array[8205, 8204, 8205]::integer[], '表示名に見えない文字は使えません'),
  (23, '文字の間の ZWJ', array[28783, 12426, 8205, 12398, 20154]::integer[], '表示名に見えない文字は使えません'),
  (24, '絵文字の後・文字の前の ZWJ', array[127982, 8205, 12398, 20154]::integer[], '表示名に見えない文字は使えません'),
  (25, '文字の後・絵文字の前の ZWJ', array[28783, 12426, 8205, 127982]::integer[], '表示名に見えない文字は使えません'),
  (26, '末尾の ZWJ', array[127982, 8205]::integer[], '表示名に見えない文字は使えません'),
  (27, '先頭の ZWJ', array[8205, 127982]::integer[], '表示名に見えない文字は使えません'),
  (28, 'ZWJ の連続', array[128104, 8205, 8205, 128105]::integer[], '表示名に見えない文字は使えません'),
  (29, '記号の間の ZWJ（U+2100 ZWJ U+2100）', array[8448, 8205, 8448]::integer[], '表示名に見えない文字は使えません'),
  (30, 'タグ文字だけ', array[917607, 917602]::integer[], '表示名に見えない文字は使えません'),
  (31, 'タグの終端だけ', array[917631]::integer[], '表示名に見えない文字は使えません'),
  (32, '終端の無いタグ列', array[127988, 917607, 917602, 917605, 917614, 917607, 28783, 12426]::integer[], '表示名に見えない文字は使えません'),
  (33, '黒旗の無いタグ列', array[28783, 12426, 917607, 917602, 917605, 917614, 917607, 917631]::integer[], '表示名に見えない文字は使えません'),
  (34, '黒旗以外の絵文字に付けたタグ列', array[127982, 917607, 917602, 917631]::integer[], '表示名に見えない文字は使えません'),
  (35, '文字の中に隠したタグ列', array[28783, 12426, 917608, 917609, 12398, 20154]::integer[], '表示名に見えない文字は使えません'),
  (36, 'タグの中身が無い終端', array[127988, 917631]::integer[], '表示名に見えない文字は使えません'),
  (37, '無効な旗のタグ列（gbzzz）', array[127988, 917607, 917602, 917626, 917626, 917626, 917631]::integer[], '表示名に見えない文字は使えません'),
  (38, '3つ以外の地域の旗のタグ列（ustx）', array[127988, 917621, 917619, 917620, 917624, 917631]::integer[], '表示名に見えない文字は使えません'),
  (39, 'イングランドの旗に余分なタグ', array[127988, 917607, 917602, 917605, 917614, 917607, 917624, 917631]::integer[], '表示名に見えない文字は使えません'),
  (40, 'タグ列の中の言語タグ（U+E0001）', array[127988, 917505, 917607, 917602, 917605, 917614, 917607, 917631]::integer[], '表示名に見えない文字は使えません'),
  (41, 'ハングルの埋め字だけ', array[12644]::integer[], '表示名に見えない文字は使えません'),
  (42, '点字の空白だけ', array[10240]::integer[], '表示名に見えない文字は使えません'),
  (43, '異体字セレクタだけ', array[65039]::integer[], '表示名に見えない文字は使えません'),
  (44, '結合文字だけ（U+0301）', array[769]::integer[], '表示名に見えない文字は使えません'),
  (45, '結合文字だけ（U+05B0）', array[1456]::integer[], '表示名に見えない文字は使えません'),
  (46, '囲み記号の結合文字だけ（U+20DD）', array[8413]::integer[], '表示名に見えない文字は使えません'),
  (47, '結合文字を重ねただけ（U+0E31 U+0E34）', array[3633, 3636]::integer[], '表示名に見えない文字は使えません'),
  (48, '右から左への上書き（U+202E）', array[28783, 12426, 8238, 12398, 20154]::integer[], '表示名に見えない文字は使えません'),
  (49, '先頭の U+FEFF', array[65279, 28783, 12426]::integer[], '表示名に見えない文字は使えません'),
  (50, '制御文字だけ（見えない文字より先に「改行や制御文字」）', array[1]::integer[], '表示名に改行や制御文字は使えません'),
  (51, '並びの検査はメールアドレスの形より先', array[8205, 97, 64, 98]::integer[], '表示名に見えない文字は使えません'),
  (52, 'メールアドレスの形', array[97, 64, 98]::integer[], '表示名にメールアドレスは使えません'),
  (53, '21文字', array[12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354, 12354]::integer[], '表示名は20文字以内で入力してください'),
  (54, '名前の中の行区切り（U+2028）', array[28783, 12426, 8232, 12398, 20154]::integer[], '表示名に改行や制御文字は使えません'),
  (55, '名前の中の段落区切り（U+2029）', array[28783, 12426, 8233, 12398, 20154]::integer[], '表示名に改行や制御文字は使えません')
-- END display_name_cases
) as c(ord, label, code_points, expected)
order by c.ord;
reset role;

select is(
  (select display_name from users where id = 'a4160000-0000-4000-8000-000000000001'),
  'e' || chr(769),
  '拒否された名前は保存されず、最後に受け付けた名前（結合文字の付いた文字）のまま'
);

-- =========================================================
-- 3. 問い合わせの個別削除（R23 重要2）
-- =========================================================
set local role service_role;
select is(public.delete_contact_message('c4160000-0000-4000-8000-000000000001'), true, 'delete_contact_message: 指定した問い合わせを消し、true を返す');
select is(public.delete_contact_message('c4160000-0000-4000-8000-000000000001'), false, 'delete_contact_message: 無い（消し済み・戻したバックアップに無い）問い合わせは false（再適用の途中で止まらない）');
select throws_ok(
  $$ select public.delete_contact_message(null) $$,
  '22023', 'お問い合わせを指定してください', 'delete_contact_message: 指定が無ければ不可'
);
reset role;
select is(
  (select pg_catalog.array_agg(id order by id) from contact_messages where id in ('c4160000-0000-4000-8000-000000000001', 'c4160000-0000-4000-8000-000000000002')),
  array['c4160000-0000-4000-8000-000000000002'::uuid],
  'delete_contact_message は指定した問い合わせだけを消す'
);

select * from finish();

rollback;
