-- verification_requests を Spec §9.1 / docs/CONTRACT.md 追補（2026-09-09）の形に合わせる。
--
-- 0001_init.sql が作った verification_requests（id, spot_id, user_id, due_at, answered_at, created_at）
-- には status / answered_verification_id が無く、`/verify/[requestId]` の requestId を
-- 解決するのに必要な状態機械（open|answered|missed）を表現できていなかった（監査 §10）。
-- このマイグレーションで列を追加し、「同一スポットに open は高々1件」を部分ユニークインデックスで保証する。

-- =========================================================
-- 列の追加
-- =========================================================
alter table verification_requests
  add column if not exists status text not null default 'open';

alter table verification_requests
  add column if not exists answered_verification_id uuid references verifications (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'verification_requests_status_check'
  ) then
    alter table verification_requests
      add constraint verification_requests_status_check
      check (status in ('open', 'answered', 'missed'));
  end if;
end $$;

-- answered_at は status / answered_verification_id に置き換えられたため不要（0001時点では未使用データのみ）。
-- 0001_init.sql が作った (user_id, answered_at) の複合インデックスは
-- verification_requests_user_status_idx（下記）に置き換わるため、列を落とす前に明示的に削除しておく。
drop index if exists verification_requests_user_idx;
alter table verification_requests drop column if exists answered_at;

-- =========================================================
-- 「同一スポットに open は高々1件」（Spec §9.1）を部分ユニークインデックスで保証
-- =========================================================
create unique index if not exists verification_requests_one_open_per_spot
  on verification_requests (spot_id)
  where status = 'open';

-- =========================================================
-- 追加インデックス（getVerificationRequest / listOpenRequests の検索経路）
-- =========================================================
create index if not exists verification_requests_status_idx on verification_requests (status);
create index if not exists verification_requests_due_at_idx on verification_requests (due_at);
create index if not exists verification_requests_user_status_idx on verification_requests (user_id, status);

-- =========================================================
-- RLS 方針の確認（0002_rls.sql で既に有効化・select policy 設定済み）
--   - verification_requests_select_self: user_id = auth.uid() の行のみ読める（依頼先本人のみ）。
--   - insert/update/delete のポリシーは意図的に用意しない。
--     生成（published到達時・回答受理時）と status 遷移（open→answered / open→missed）は
--     すべてサーバー側（Server Action / Cron から service role キーで実行）が行う。
-- =========================================================
