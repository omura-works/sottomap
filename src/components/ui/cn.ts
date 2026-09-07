/**
 * クラス名を結合する軽量ヘルパー。falsy な値は無視する。
 * `src/components/ui/**` は T1 の所有領域のため、外部ライブラリ（clsx等）を
 * 追加せずここに実装する。
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
