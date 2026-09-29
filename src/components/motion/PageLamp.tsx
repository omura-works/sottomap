// "use client" 不要（サーバー部品からも使える）。
import { ViewTransition } from "@/components/motion/view-transition";

export interface PageLampProps {
  /** 置く面。夜の面（neutral-900）の上なら "night"。 */
  tone?: "paper" | "night";
  /**
   * ページをまたいでモーフするか（既定 true）。スマホ用と PC 用の見出しが両方 DOM にある画面（地図）では、
   * 見えている方だけを true にする（同じ名前の ViewTransition が2つ同時にあると React がエラーにするため）。
   */
  morph?: boolean;
}

/**
 * ページの灯り（SPEC motion §4.1.2）。h1（またはキッカーの札）の左に置く橙の点。
 * ページが変わると、前のページの灯りからこの灯りへ `page-lamp` の共有要素としてモーフして渡る。
 * **1ページに1つだけ置く**（同じ名前が2つ描かれると、その遷移の演出がまるごと止まる）。
 * 地図のスマホ用と PC 用の見出しのように片方が `display: none` の所は、両方に置き、見えている方だけ `morph`。
 */
export function PageLamp({ tone = "paper", morph = true }: PageLampProps) {
  const lamp = <span className="page-lamp" data-tone={tone} aria-hidden="true" />;
  if (!morph) return lamp;
  return (
    <ViewTransition name="page-lamp" share="lamp-morph" default="none">
      {lamp}
    </ViewTransition>
  );
}
