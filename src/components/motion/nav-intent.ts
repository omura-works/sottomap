/**
 * 型付きのページ遷移（page-forward・page-back・lamp-iris）を始めたことを `<html data-nav>` に残す。
 * 遷移の「新しい画面」はまずロード中の画面になるので、その間はロード中の骨格・紙の地図の道を**待たずに描き終わった形**で出す
 * （入る側のスライド・アイリスの円の中が無地の紙にならないように。globals.css の `html[data-nav]`）。
 * 印は、その遷移で移った先のページにいる間は残し、次にページが変わったとき MotionRoot が外す。
 */
export type NavIntent = "page-forward" | "page-back" | "lamp-iris";

export function markNavigation(type: NavIntent): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.nav = type;
  root.dataset.navFresh = "1";
}

/** ページが変わったとき（MotionRoot）に呼ぶ。今の遷移で着いたページなら印を残し、その次の移動で外す。 */
export function settleNavigation(): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.navFresh === "1") {
    root.dataset.navFresh = "0";
    return;
  }
  delete root.dataset.nav;
  delete root.dataset.navFresh;
}
