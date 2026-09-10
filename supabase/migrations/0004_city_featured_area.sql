-- cities.featured_area: 街の代表エリア名（docs/CONTRACT.md 追補 2026-09-09）。
--
-- S2/D1 見出し「札幌・北24条」の後半部分。§9.12-7 の目視検証で、表示中スポットの
-- 最頻エリアから推定すると実データ次第で意図しないエリア（例:「札幌・すすきの」）に
-- なってしまうことが分かったため、街ごとに固定値として持たせる。

alter table cities add column if not exists featured_area text;

comment on column cities.featured_area is
  'S2/D1見出し「札幌・北24条」の後半。無ければ市区町村名のみ表示（CONTRACT追補）。';

update cities set featured_area = '北24条' where slug = 'sapporo';
update cities set featured_area = '色内'   where slug = 'otaru';
