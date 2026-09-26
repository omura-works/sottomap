import type { NavItem } from "./nav-items";

export interface NavIconProps {
  name: NavItem["key"];
  /** 選択中は塗り（accent-400）＋線（accent-600）。それ以外は文字色の細線だけ。 */
  active: boolean;
  size?: number;
}

/**
 * ナビ（サイドレール・下部タブ）の線のアイコン: 地図・さがす（虫眼鏡）・栞（しおり）・自分（人）。
 * 形は 2026-09-26 の採用案（案D）の見本どおり。装飾なので読み上げない（隣にラベルの文字がある）。
 */
export function NavIcon({ name, active, size = 20 }: NavIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={active ? "var(--color-accent-400)" : "none"}
      stroke={active ? "var(--color-accent-600)" : "currentColor"}
      strokeWidth={1.7}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {name === "map" ? <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14" /> : null}
      {name === "search" ? (
        <>
          <circle cx={11} cy={11} r={6} />
          <path d="m20 20-4.5-4.5" />
        </>
      ) : null}
      {name === "bookmarks" ? <path d="M7 3h10v18l-5-4-5 4z" /> : null}
      {name === "me" ? (
        <>
          <circle cx={12} cy={8} r={4} />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </>
      ) : null}
    </svg>
  );
}
