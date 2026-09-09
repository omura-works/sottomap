// 検索・一覧の絞り込みチップ定義（Task 3 所有）。
// SPEC §4 S3 / D1 の5種（既定で「まだ静か」だけON）。
// slug は docs/CONTRACT.md `SpotQuery.filters` の想定値と一致させる。

export interface FilterOption {
  slug: "quiet-now" | "day-only" | "cash-only" | "solo-ok" | "within-10min";
  label: string;
}

export const FILTER_OPTIONS: readonly FilterOption[] = [
  { slug: "quiet-now", label: "まだ静か" },
  { slug: "day-only", label: "昼だけ" },
  { slug: "cash-only", label: "現金のみ" },
  { slug: "solo-ok", label: "ひとりで入れる" },
  { slug: "within-10min", label: "徒歩10分" },
] as const;

export const DEFAULT_ACTIVE_FILTERS: readonly string[] = ["quiet-now"];

/**
 * URLクエリ `filters` をパースする。
 * - パラメータ自体が無い（undefined/null） → 既定値（「まだ静か」のみON）
 * - `"none"`（全チップOFFの明示値） → 空配列
 * - それ以外 → カンマ区切りで既知の slug だけを残す
 */
export function parseFiltersParam(value: string | undefined | null): string[] {
  if (value === undefined || value === null) return [...DEFAULT_ACTIVE_FILTERS];
  if (value === "" || value === "none") return [];
  const known = new Set(FILTER_OPTIONS.map((f) => f.slug));
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => known.has(s as FilterOption["slug"]));
}

/** parseFiltersParam の逆変換。全OFFのときは "none" を明示する。 */
export function serializeFiltersParam(filters: readonly string[]): string {
  return filters.length > 0 ? filters.join(",") : "none";
}
