/**
 * アイリス（`lamp-iris` の遷移）の中心を `<html>` に書く（SPEC motion §4.2.4）。
 * 押した要素の中心を、新しいページの箱（`[data-page-root]`）の左上を原点にした座標にする。
 * 行き先はどちらも `/[city]`（ナビのある画面）なので、PC（1024px 以上）では左ナビの幅 88px を引く。
 * `onClick` の最初（遷移を始める前）に呼ぶ。誤差 ±24px は許す。
 */
export const RAIL_WIDTH = 88;

export function setIrisOrigin(el: Element): void {
  if (typeof window === "undefined") return;
  const r = el.getBoundingClientRect();
  const railOffset = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches ? RAIL_WIDTH : 0;
  const banner = document.querySelector<HTMLElement>("[data-demo-banner]");
  const bannerOffset = banner ? banner.offsetHeight : 0;
  const style = document.documentElement.style;
  style.setProperty("--iris-x", `${Math.round(r.left + r.width / 2 - railOffset)}px`);
  style.setProperty("--iris-y", `${Math.round(r.top + r.height / 2 - bannerOffset)}px`);
}
