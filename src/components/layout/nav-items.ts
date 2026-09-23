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
