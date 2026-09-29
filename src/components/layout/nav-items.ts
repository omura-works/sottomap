/**
 * モバイル下部タブ / デスクトップ用サイドレール共通のナビゲーション項目。
 *
 * SPEC §9.14-3: 「地図」「さがす」は、街のページにいるときはその街へ、
 * それ以外（栞・自分・確認）では利用者の居住街へ、居住街が未設定なら札幌へリンクする。
 */
export interface NavItem {
  key: "map" | "search" | "bookmarks" | "me";
  label: string;
  href: string;
}

const DEFAULT_CITY_SLUG = "sapporo";

/** 固定8都市（Spec §2）。パス先頭がこの中にあれば「街のページにいる」とみなす。 */
export const KNOWN_CITY_SLUGS: readonly string[] = [
  "sapporo",
  "otaru",
  "hakodate",
  "asahikawa",
  "furano",
  "kushiro",
  "obihiro",
  "wakkanai",
];

/**
 * 現在のpathnameから「地図」「さがす」が向かうべき街のslugを決める。
 * - pathname の先頭セグメントが既知の街slugならその街。
 * - それ以外（栞・自分・確認・start等）は利用者の居住街（homeCitySlug）。
 * - 居住街が無ければ札幌。
 */
export function cityContextFromPathname(pathname: string, homeCitySlug: string | null | undefined): string {
  const firstSegment = pathname.split("/")[1] ?? "";
  if (KNOWN_CITY_SLUGS.includes(firstSegment)) return firstSegment;
  return homeCitySlug ?? DEFAULT_CITY_SLUG;
}

/** 街slugからナビ4項目を組み立てる。 */
export function getNavItems(citySlug: string): ReadonlyArray<NavItem> {
  return [
    { key: "map", label: "地図", href: `/${citySlug}` },
    { key: "search", label: "さがす", href: `/${citySlug}/search` },
    { key: "bookmarks", label: "栞", href: "/bookmarks" },
    { key: "me", label: "自分", href: "/me" },
  ];
}

/** 現在のパスからどのタブをアクティブ表示するか判定する。 */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  switch (item.key) {
    case "search":
      return pathname.endsWith("/search");
    case "bookmarks":
      return pathname === "/bookmarks" || pathname.startsWith("/bookmarks/");
    case "me":
      return pathname === "/me" || pathname.startsWith("/me/");
    case "map": {
      // 街のページ（/[city] とその下。/[city]/search を除く）のときだけ。
      // 「他のタブに当てはまらなければ地図」にすると、/faq・/terms などの単独ページまで
      // 地図として aria-current="page" になってしまうため、先頭が既知の街 slug かで判定する。
      const firstSegment = pathname.split("/")[1] ?? "";
      return KNOWN_CITY_SLUGS.includes(firstSegment) && !pathname.endsWith("/search");
    }
    default:
      return false;
  }
}

/** タブの順番（左から右へ）。ページの切り替えの向きを決める（SPEC motion §4.2.1）。 */
const NAV_ORDER: Readonly<Record<NavItem["key"], number>> = { map: 0, search: 1, bookmarks: 2, me: 3 };

export type PageTransitionType = "page-forward" | "page-back";

/**
 * 今いるページからタブ（toKey）へ移るときのページの切り替えの型（SPEC motion §4.2.1）。
 * - 右のタブへ進む（地図→さがす→栞→自分）は "page-forward"、左へ戻るのは "page-back"。
 * - 今いるページがタブに当たらない（/faq など）ときは "page-forward"。
 * - 今と同じタブなら null（型を付けない）。
 */
export function navDirection(fromPathname: string, toKey: NavItem["key"]): PageTransitionType | null {
  const current = getNavItems("sapporo").find((item) => isNavItemActive(item, fromPathname));
  if (!current) return "page-forward";
  if (current.key === toKey) return null;
  return NAV_ORDER[toKey] > NAV_ORDER[current.key] ? "page-forward" : "page-back";
}

/**
 * アプリ全体のチロム（下部タブ／サイドレール）を隠すルート prefix。
 * /start はオンボーディング前の単独導線、/verify/[requestId] はメールリンク等からの
 * 単独導線のため、ナビゲーションチロムなしのフルスクリーン表示にする。
 */
const CHROME_HIDDEN_PREFIXES = ["/start", "/verify", "/login", "/auth"];

export function isChromeHidden(pathname: string): boolean {
  return CHROME_HIDDEN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * フッター（利用規約・プライバシーポリシー・よくある質問・お問い合わせ・掲載店舗の方への案内）を
 * 隠すべきページか。
 * - S2「地図」/ D1「PC版トップ」`/[city]` は原本どおり地図が画面いっぱいを占める設計
 *   （`CityMapScreen` が `h-screen` 相当で組んでいる）ため、フッターを重ねない。
 * - それ以外はすべて出す。チロムなしのページ（/login・/start・/verify）でも、ナビは隠すが
 *   フッターは出す（ログイン画面から利用規約・プライバシーポリシーへ行けるように。R19 軽微）。
 *   `/[city]/search` 等の一覧画面はスクロールする通常ページなのでフッターを出す。
 */
export function isFooterHidden(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && KNOWN_CITY_SLUGS.includes(segments[0]);
}
