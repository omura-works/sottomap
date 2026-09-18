// 住んでいる街（home_city）の変更規則（docs/SPEC.md §9.16）。
// DB 側の正は supabase/migrations/0007_home_city_change_limit.sql の set_home_city。
// ここはデモモード（フィクスチャ）と画面の表示（次に変えられる日）が同じ規則を使うための純関数。

export const HOME_CITY_CHANGE_INTERVAL_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Asia/Tokyo は夏時間が無いので、固定の +9 時間で日付を求める。 */
const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

export const HOME_CITY_LIMIT_PREFIX = "住んでいる街は90日に1回まで変えられます";

/** 最後に変えた時刻から、次に変えられる時刻（90日後）を返す。未変更（null）なら null（いつでも変えられる）。 */
export function nextHomeCityChangeAt(changedAt: string | Date | null): Date | null {
  if (changedAt === null) return null;
  const base = changedAt instanceof Date ? changedAt : new Date(changedAt);
  return new Date(base.getTime() + HOME_CITY_CHANGE_INTERVAL_DAYS * DAY_MS);
}

/** 今（now）別の街へ変えられるか。ちょうど90日経った時点から変えられる（DB と同じ境界）。 */
export function canChangeHomeCity(changedAt: string | Date | null, now: Date = new Date()): boolean {
  const next = nextHomeCityChangeAt(changedAt);
  return next === null || next.getTime() <= now.getTime();
}

/**
 * 次に変えられる日を「2026年12月18日」の形にする（東京の日付）。
 * 時刻の端数がある場合は翌日へ切り上げる（「◯日以降」がその日の0時から必ず正しくなるように。DB と同じ）。
 */
export function formatHomeCityChangeDate(next: Date): string {
  const tokyo = new Date(next.getTime() + TOKYO_OFFSET_MS);
  const hasFraction =
    tokyo.getUTCHours() !== 0 ||
    tokyo.getUTCMinutes() !== 0 ||
    tokyo.getUTCSeconds() !== 0 ||
    tokyo.getUTCMilliseconds() !== 0;
  const day = new Date(
    Date.UTC(tokyo.getUTCFullYear(), tokyo.getUTCMonth(), tokyo.getUTCDate() + (hasFraction ? 1 : 0)),
  );
  return `${day.getUTCFullYear()}年${day.getUTCMonth() + 1}月${day.getUTCDate()}日`;
}

/** 90日以内の変更を拒否するときの文言（DB の例外と同じ）。 */
export function homeCityLimitMessage(next: Date): string {
  return `${HOME_CITY_LIMIT_PREFIX}。次に変えられるのは${formatHomeCityChangeDate(next)}以降です。`;
}

/** /me の確認ダイアログの文言（SPEC §9.16）。今変えたときに、次に変えられる日を添える。 */
export function homeCityConfirmMessage(cityName: string, now: Date = new Date()): string {
  const next = nextHomeCityChangeAt(now) ?? now;
  return `住んでいる街を${cityName}に変えますか。次に変えられるのは${formatHomeCityChangeDate(next)}以降です。`;
}
