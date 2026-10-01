"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode, RefObject } from "react";
import { prefersReducedMotion } from "@/components/ui/motion-prefs";
import { STAGGER } from "./tokens";

export type RevealVerb = "stick" | "stamp" | "pop" | "ignite" | "draw" | "tuck";
export type RevealState = "done" | "wait" | "play" | "parts";

export interface RevealProps {
  as?: "div" | "li" | "span" | "section" | "p";
  verb: RevealVerb;
  /** 遅れ（ミリ秒）。`index` のずらしに足される。 */
  delay?: number;
  /** 並びの番号。`min(index, 7) × 45ms` だけ遅らせる。 */
  index?: number;
  /**
   * マウントの時にすでに画面に見えている物の扱い。既定 "skip"（最終状態のまま何もしない）。
   * "parts" なら、包み自体は動かさず（透明にもしない）、`inViewDelay` の後に `data-reveal="parts"` にして
   * 中身の動き（CSS の `[data-reveal="parts"] …`）だけを一度再生する（/me の灯りのバッジの棒など）。
   */
  inView?: "skip" | "parts";
  /** inView="parts" のときの遅れ（ミリ秒）。`index` のずらしに足される。 */
  inViewDelay?: number;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * 最初の画面に入っている物の、中身の動きだけを一度再生する（包みは動かさず、透明にもしない）。
 * 中身の動きが終わったら "done" に戻す。片付けの関数を返す。
 */
function playParts(el: HTMLElement, delayMs: number): () => void {
  el.style.setProperty("--d", `${delayMs}ms`);
  el.dataset.reveal = "parts";
  const finish = () => {
    if (el.dataset.reveal !== "parts") return;
    el.dataset.reveal = "done";
    el.removeEventListener("animationend", onEnd);
    clearTimeout(fallback);
  };
  function onEnd() {
    const running =
      typeof el.getAnimations === "function"
        ? el.getAnimations({ subtree: true }).some((animation) => animation.playState === "running")
        : false;
    if (!running) finish();
  }
  const fallback = setTimeout(finish, DONE_FALLBACK_MS + delayMs);
  el.addEventListener("animationend", onEnd);
  return finish;
}

const OBSERVER_OPTIONS: IntersectionObserverInit = { rootMargin: "0px 0px -10% 0px", threshold: 0.2 };
/** animationend が届かない場合（途中で要素が隠れた等）の保険。 */
const DONE_FALLBACK_MS = 2000;

/**
 * 初回表示の外にある物の「貼る・押す・跳ねる・灯る・描く・挟む」を、画面に入った時に1回だけ再生する
 * （SPEC motion §4.3）。
 *
 * 状態は `data-reveal` で持ち、React の状態にはしない（描き直しを起こさない・JS が動かなくても最終状態）。
 * - サーバー描画とハイドレーション直後は "done"（最終状態）。
 * - マウント後、reduce・`IntersectionObserver` 無し・すでに画面に見えている物は "done" のまま。
 * - 上端が画面の下端より下なら "wait"（最初の状態で待つ。画面の外なので見えない）にして見張る。
 * - 画面に入ったら "play"（`verb-{verb}` を付け `--d` を入れる）→ 動き終わりで "done"。
 * - 一度 "done" になった物は二度と再生しない。スクロールを戻しても逆再生しない。
 * - 中にフォーカスが入ったら（focusin）すぐ "done"。
 */
export function Reveal({
  as = "div",
  verb,
  delay = 0,
  index = 0,
  inView = "skip",
  inViewDelay = 0,
  className,
  style,
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) return;
    if (typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    const viewportBottom = window.innerHeight || document.documentElement.clientHeight;
    if (rect.top <= viewportBottom) {
      if (inView !== "parts") return;
      return playParts(el, inViewDelay + Math.min(Math.max(index, 0), STAGGER.maxIndex) * STAGGER.step);
    }

    const verbClass = `verb-${verb}`;
    let fallback: ReturnType<typeof setTimeout> | undefined;
    let observer: IntersectionObserver | null = null;

    const finish = () => {
      if (el.dataset.reveal === "done") return;
      el.dataset.reveal = "done";
      el.classList.remove(verbClass);
      observer?.disconnect();
      observer = null;
      if (fallback) clearTimeout(fallback);
      el.removeEventListener("animationend", onAnimationEnd);
      el.removeEventListener("focusin", finish);
    };

    function onAnimationEnd(event: AnimationEvent) {
      if (event.target !== el && !el?.contains(event.target as Node)) return;
      // まだ動いている物（ずらした子・インクの輪）が残っていれば待つ。getAnimations が無ければ最初の終わりで閉じる。
      const running =
        typeof el?.getAnimations === "function"
          ? el.getAnimations({ subtree: true }).some((animation) => animation.playState === "running")
          : false;
      if (!running) finish();
    }

    const play = () => {
      if (el.dataset.reveal !== "wait") return;
      const d = delay + Math.min(Math.max(index, 0), STAGGER.maxIndex) * STAGGER.step;
      el.style.setProperty("--d", `${d}ms`);
      el.classList.add(verbClass);
      el.dataset.reveal = "play";
      fallback = setTimeout(finish, DONE_FALLBACK_MS + d);
    };

    el.dataset.reveal = "wait";
    el.addEventListener("focusin", finish);
    el.addEventListener("animationend", onAnimationEnd);
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer?.disconnect();
      observer = null;
      play();
    }, OBSERVER_OPTIONS);
    observer.observe(el);

    return () => {
      observer?.disconnect();
      if (fallback) clearTimeout(fallback);
      el.removeEventListener("animationend", onAnimationEnd);
      el.removeEventListener("focusin", finish);
      // アンマウントや描き直しで見張りをやめるときは、最終状態に戻しておく（隠れたまま残さない）。
      if (el.dataset.reveal !== "done") {
        el.dataset.reveal = "done";
        el.classList.remove(verbClass);
      }
    };
    // 見張りはマウントの1回だけ（props が変わっても再生し直さない）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // as の要素はどれも HTMLElement。ref の型を1つにそろえるため div として扱う。
  const Tag = as as "div";
  return (
    <Tag ref={ref as RefObject<HTMLDivElement | null>} className={className} style={style} data-reveal="done" data-verb={verb}>
      {children}
    </Tag>
  );
}
