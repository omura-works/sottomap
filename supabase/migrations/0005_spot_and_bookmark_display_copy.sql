-- SPEC §9.8 の画面固有コピー。
-- 店そのものに属する説明は spots、利用者の栞に属するメタ文言は bookmarks に保持する。

alter table spots add column if not exists hover_description text;
alter table bookmarks add column if not exists meta text;

comment on column spots.hover_description is
  'D1ホバーカード専用の店説明。nullの場合はreasonへフォールバックする。';
comment on column bookmarks.meta is
  'S8の栞ごとの固有メタ文言。nullの場合は街・エリア・予定日時から組み立てる。';
