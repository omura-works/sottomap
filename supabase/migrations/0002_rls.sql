-- ウラスポ RLS ポリシー
-- Spec: docs/SPEC.md §3「RLS方針」
--   - spots: status='published' は誰でも読める。pending は投稿者と同じ街のユーザーのみ。
--   - endorsements: 自分の行のみ挿入可。自分の投稿したスポットには挿入不可。
--   - verifications: 対象スポットの author_id のみ挿入可。
--   - bookmarks: 自分の行のみ読み書き可。
--
-- 方針メモ（Spec に明記が無い部分の実装判断）:
--   - spots/endorsements/verifications の状態遷移（pending→published 等、
--     lifecycle.ts が判定する再計算）は、Server Action / Vercel Cron から
--     Supabase の service role キー（RLSをバイパスする）で実行する前提とし、
--     一般ユーザー向けの update ポリシーはあえて用意しない。
--   - cities / tags / badges は参照専用データなので誰でも読めるが、
--     書き込みは service role のみ（一般ユーザー向けポリシーを作らない = 拒否）。
--   - users は表示名・エリア・在住年数など投稿者クレジット表示に使うため公開読み取り可。
--     自分の行のみ挿入・更新可。

alter table cities enable row level security;
alter table tags enable row level security;
alter table badges enable row level security;
alter table users enable row level security;
alter table spots enable row level security;
alter table spot_tags enable row level security;
alter table endorsements enable row level security;
alter table verifications enable row level security;
alter table verification_requests enable row level security;
alter table bookmarks enable row level security;
alter table user_badges enable row level security;

-- =========================================================
-- 参照専用テーブル: 誰でも読める
-- =========================================================
create policy cities_select_all on cities
  for select using (true);

create policy tags_select_all on tags
  for select using (true);

create policy badges_select_all on badges
  for select using (true);

-- =========================================================
-- users: 公開読み取り可（投稿者クレジット表示用）。書き込みは本人のみ。
-- =========================================================
create policy users_select_all on users
  for select using (true);

create policy users_insert_self on users
  for insert with check (auth.uid() = id);

create policy users_update_self on users
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- =========================================================
-- spots
--   published: 誰でも読める
--   pending  : 投稿者本人 または 同じ街に home_city_id を持つユーザーのみ
--   dormant / expired: 投稿者本人のみ（プロフィール「あなたが書いた店」用）
-- =========================================================
create policy spots_select_published on spots
  for select using (status = 'published');

create policy spots_select_pending_same_city on spots
  for select using (
    status = 'pending'
    and (
      author_id = auth.uid()
      or exists (
        select 1 from users u
        where u.id = auth.uid()
          and u.home_city_id = spots.city_id
      )
    )
  );

create policy spots_select_own_dormant_expired on spots
  for select using (
    status in ('dormant', 'expired')
    and author_id = auth.uid()
  );

-- 投稿: ログインユーザーが自分を author として pending で作成する
create policy spots_insert_own on spots
  for insert with check (
    author_id = auth.uid()
    and status = 'pending'
  );

-- 更新/削除ポリシーは意図的に用意しない（上記メモ参照。service role が行う）。

-- =========================================================
-- spot_tags: 対応する spot が読めるなら読める。書き込みは service role のみ。
-- =========================================================
create policy spot_tags_select_via_spot on spot_tags
  for select using (
    exists (
      select 1 from spots s
      where s.id = spot_tags.spot_id
    )
  );

-- =========================================================
-- endorsements
--   挿入: 自分の行のみ、かつ自分が投稿したスポットには挿入不可
--   閲覧: 誰でも（承認人数の表示に使うため）
-- =========================================================
create policy endorsements_select_all on endorsements
  for select using (true);

create policy endorsements_insert_self_not_own_spot on endorsements
  for insert with check (
    user_id = auth.uid()
    and not exists (
      select 1 from spots s
      where s.id = endorsements.spot_id
        and s.author_id = auth.uid()
    )
  );

-- =========================================================
-- verifications
--   挿入: 対象スポットの author_id のみ
--   閲覧: 誰でも（静けさ判定・履歴表示に使うため）
-- =========================================================
create policy verifications_select_all on verifications
  for select using (true);

create policy verifications_insert_spot_author_only on verifications
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from spots s
      where s.id = verifications.spot_id
        and s.author_id = auth.uid()
    )
  );

-- =========================================================
-- verification_requests: 本人のみ閲覧可。作成は service role（cron）が行う。
-- =========================================================
create policy verification_requests_select_self on verification_requests
  for select using (user_id = auth.uid());

-- =========================================================
-- bookmarks: 自分の行のみ読み書き可
-- =========================================================
create policy bookmarks_select_self on bookmarks
  for select using (user_id = auth.uid());

create policy bookmarks_insert_self on bookmarks
  for insert with check (user_id = auth.uid());

create policy bookmarks_update_self on bookmarks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy bookmarks_delete_self on bookmarks
  for delete using (user_id = auth.uid());

-- =========================================================
-- user_badges: 本人と公開プロフィール表示のため誰でも読める。書き込みは service role のみ。
-- =========================================================
create policy user_badges_select_all on user_badges
  for select using (true);
