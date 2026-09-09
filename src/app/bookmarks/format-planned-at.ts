/**
 * S8 栞リストの「札幌・北24条 / 明日 12:30」のような日時ラベルを作る。
 * `plannedAt` は Bookmark.plannedAt（実ISO日時、null可）。
 */
export function formatPlannedAt(iso: string | null): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  const time = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;

  if (diffDays === 0) return `今日 ${time}`;
  if (diffDays === 1) return `明日 ${time}`;
  if (diffDays === -1) return `昨日 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}
