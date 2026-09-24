// 投稿者の署名（SPEC §4「— 北24条に14年、Kさん」）。
// SPEC §9.18-2: エリア・居住年数は現行の画面から入力できないため、実DBの利用者の多くは NULL。
// どちらかが無ければ表示名だけにする（「に?年、地元の人」のように崩さない）。

export interface AuthorLabelInput {
  displayName: string;
  areaName: string | null;
  residentYears: number | null;
}

export function formatAuthorLabel({ displayName, areaName, residentYears }: AuthorLabelInput): string {
  if (areaName && residentYears !== null) return `${areaName}に${residentYears}年、${displayName}`;
  return displayName;
}
