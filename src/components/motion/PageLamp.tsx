// "use client" 不要（サーバー部品からも使える）。
import { ViewTransition } from "@/components/motion/view-transition";

export interface PageLampProps {
  /** 置く面。夜の面（neutral-900）の上なら "night"。 */
  tone?: "paper" | "night";
}

/**
 * ページの灯り（SPEC motion §4.1.2）。h1（またはキッカーの札）の左に置く橙の点。
 * ページが変わると、前のページの灯りからこの灯りへ `page-lamp` の共有要素としてモーフして渡る。
 * **1ページに1つだけ置く**（同じ名前が2つ描かれると、その遷移の演出がまるごと止まる）。
 * 例外: 片方が `display: none` の見出し（地図のスマホ用と PC 用）には両方置いてよい。
 */
export function PageLamp({ tone = "paper" }: PageLampProps) {
  return (
    <ViewTransition name="page-lamp" share="lamp-morph" default="none">
      <span className="page-lamp" data-tone={tone} aria-hidden="true" />
    </ViewTransition>
  );
}
