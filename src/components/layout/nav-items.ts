/**
 * モバイル下部タブ / デスクトップ用サイドレール共通のナビゲーション項目。
 *
 * 街コンテキスト（現在どの街を歩いているか）はまだ存在しない（T2/T3 の領域）ため、
 * 「地図」「さがす」は Spec §4 のデフォルト街として札幌（`sapporo`）へ暫定的にリンクする。
 * T3 が街切り替えの実装を持ち込んだ際は、このファイルは T1 所有のままなので
 * 変更が必要であれば報告してもらうこと。
 */
export interface NavItem {
  key: "map" | "search" | "bookmarks" | "me";
  label: string;
  href: string;
}

const DEFAULT_CITY_SLUG = "sapporo";

export const NAV_ITEMS: ReadonlyArray<NavItem> = [
  { key: "map", label: "地図", href: `/${DEFAULT_CITY_SLUG}` },
  { key: "search", label: "さがす", href: `/${DEFAULT_CITY_SLUG}/search` },
  { key: "bookmarks", label: "栞", href: "/bookmarks" },
  { key: "me", label: "自分", href: "/me" },
];

/** 現在のパスからどのタブをアクティブ表示するか判定する。 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  switch (item.key) {
    case "search":
      return pathname.endsWith("/search");
    case "bookmarks":
      return pathname === "/bookmarks" || pathname.startsWith("/bookmarks/");
    case "me":
      return pathname === "/me" || pathname.startsWith("/me/");
    case "map":
      // 街のルート直下（/[city]）かつ他タブに該当しない場合のみ。
      return (
        !pathname.endsWith("/search") &&
        !pathname.startsWith("/bookmarks") &&
        !pathname.startsWith("/me") &&
        !pathname.startsWith("/start") &&
        !pathname.startsWith("/verify") &&
        pathname !== "/"
      );
    default:
      return false;
  }
}

/**
 * アプリ全体のチロム（下部タブ／サイドレール）を隠すルート prefix。
 * /start はオンボーディング前の単独導線、/verify/[requestId] はメールリンク等からの
 * 単独導線のため、ナビゲーションチロムなしのフルスクリーン表示にする。
 */
const CHROME_HIDDEN_PREFIXES = ["/start", "/verify"];

export function isChromeHidden(pathname: string): boolean {
  return CHROME_HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
