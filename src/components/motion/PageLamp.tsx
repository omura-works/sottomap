"use client";

import { useSyncExternalStore } from "react";
import { ViewTransition } from "@/components/motion/view-transition";

export interface PageLampProps {
  /** 置く面。夜の面（neutral-900）の上なら "night"。 */
  tone?: "paper" | "night";
  /**
   * **地図の画面専用**（ほかの画面では付けない）。ページをまたいでモーフするか（既定 true）。スマホ用と PC 用の見出しが両方 DOM にある画面（地図）では、
   * 見えている方だけを true にする（同じ名前の ViewTransition が2つ同時にあると React がエラーにするため）。
   */
  morph?: boolean;
}

const subscribe = () => () => {};

/**
 * ページの灯り（SPEC motion §4.1.2）。h1（またはキッカーの札）の左に置く橙の点。
 * ページが変わると、前のページの灯りからこの灯りへ `page-lamp` の共有要素としてモーフして渡る。
 * **1ページに1つだけ置く**（同じ名前が2つ描かれると、その遷移の演出がまるごと止まる）。
 * 地図のスマホ用と PC 用の見出しのように片方が `display: none` の所は、両方に置き、見えている方だけ `morph`。
 *
 * サーバー描画とハイドレーションの描画では名前を付けない（ただの点）。サーバーから流し込まれたページが
 * ロード中の画面と差し替わるとき、React は同じ名前の組を見つけると View Transition で差し替え、フォントの読み込みまで
 * 表示を待つため（本番条件で約 600ms、最初の表示が遅れた。2026-09-30 の測定）。最初の読み込みで灯りが渡る必要はない。
 * ハイドレーションの後の描画（アプリの中の移動）では名前を付け、ページをまたいで渡る。
 */
export function PageLamp({ tone = "paper", morph = true }: PageLampProps) {
  const hydrated = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const lamp = <span className="page-lamp" data-tone={tone} aria-hidden="true" />;
  if (!morph || !hydrated) return lamp;
  return (
    <ViewTransition name="page-lamp" share="lamp-morph" default="none">
      {lamp}
    </ViewTransition>
  );
}
