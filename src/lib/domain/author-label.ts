// 投稿者の署名（店の詳細の「— Kさん」）。
// SPEC §9.18-2（R20 重要2）: エリア・居住年数は公開しない（public_profiles から外した）。署名は表示名だけ。
// SPEC §4 の「— 北24条に14年、Kさん」は §9.18-2 で置き換えた。

export interface AuthorLabelInput {
  displayName: string;
}

export function formatAuthorLabel({ displayName }: AuthorLabelInput): string {
  return displayName;
}
