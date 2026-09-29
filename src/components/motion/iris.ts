/**
 * アイリス（`lamp-iris` の遷移）の中心を `<html>` に書く（SPEC motion §4.2.4）。
 * 押した要素の中心を、新しいページの箱（`[data-page-root]`）の左上を原点にした座標にする。
 * 行き先はどちらも `/[city]`（ナビのある画面）なので、PC（1024px 以上）では左ナビの幅 88px を引く。
 * `onClick` の最初（遷移を始める前）に呼ぶ。誤差 ±24px は許す。
 */
import { markNavigation } from "./nav-intent";

export const RAIL_WIDTH = 88;

export function setIrisOrigin(el: Element): void {
  if (typeof window === "undefined") return;
  const r = el.getBoundingClientRect();
  const railOffset = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches ? RAIL_WIDTH : 0;
  const banner = document.querySelector<HTMLElement>("[data-demo-banner]");
  // デモの帯は、押した時点で画面に見えている分だけ引く（スクロールして帯が画面の外なら 0。新しいページの箱は画面の上端から始まる）
  const bannerOffset = banner ? Math.max(0, banner.getBoundingClientRect().bottom) : 0;
  const x = r.left + r.width / 2 - railOffset;
  const y = r.top + r.height / 2 - bannerOffset;
  // 円の最後の大きさは、押した所から画面（新しいページの箱の見えている範囲）のいちばん遠い角まで。
  // 150vmax のように大きすぎると、円の縁が画面の外へ出るのが早すぎて「円で開く」が見えないため。
  const width = window.innerWidth - railOffset;
  const height = window.innerHeight - bannerOffset;
  const radius = Math.max(Math.hypot(x, y), Math.hypot(width - x, y), Math.hypot(x, height - y), Math.hypot(width - x, height - y));
  const style = document.documentElement.style;
  style.setProperty("--iris-x", `${Math.round(x)}px`);
  style.setProperty("--iris-y", `${Math.round(y)}px`);
  style.setProperty("--iris-r", `${Math.ceil(radius + 24)}px`);
  markNavigation("lamp-iris");
}
