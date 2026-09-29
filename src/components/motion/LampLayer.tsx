"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { prefersReducedMotion } from "@/components/ui/motion-prefs";
import { cubicBezier, EASE } from "./tokens";
import { stampFontSize } from "./Stamp";

/** 飛ぶ起点・行き先。要素なら呼んだ瞬間の位置の中心、DOMRect ならその中心、点ならその点。 */
export type LampPoint = Element | DOMRect | { x: number; y: number };
export type LampTargetName = "bookmarks" | "verify-slot" | "keeper-bar" | "map-button";

export interface FlyOptions {
  /** 飛ぶ物の見た目。既定 "lamp"（直径10pxの灯り）。 */
  kind?: "lamp" | "ribbon" | "stamp";
  /** kind="stamp" のときの字と配色。 */
  glyph?: string;
  tone?: "quiet" | "crowding" | "touristy";
  /** 既定 520ms。 */
  duration?: number;
  /** 既定 0。 */
  delay?: number;
  /** 着いた瞬間に1回呼ぶ（非対応・打ち止めのときは即座、reduce では行き先が 120ms で明るくなった後）。 */
  onArrive?: () => void;
}

export interface LampApi {
  /** 起点から行き先へ、上へ弧を描いて飛ばす。呼ぶ側は飛行の終わりを待たない（状態の更新・送信・遷移はすぐ行う）。 */
  fly(from: LampPoint, to: LampPoint, opts?: FlyOptions): void;
  /** data-lamp-target="name" の要素のうち、いま見えている（幅が0でない）物。候補が複数なら from に近い物。 */
  target(name: LampTargetName, from?: LampPoint): Element | null;
  /** 着いた先を1回だけ弾ませる（v-bump 450ms。reduce なら何もしない）。 */
  bump(el: Element | null): void;
}

/** 同時に飛ぶ数の上限（SPEC motion §4.1.3・§7.1）。超えた分は飛ばさず onArrive だけ呼ぶ。 */
export const MAX_FLYING = 8;
const DEFAULT_DURATION = 520;
const FADE_OUT_MS = 120;
/** reduce のとき、行き先が明るくなる長さ。 */
const REDUCED_ARRIVE_MS = 120;
const ARC_SAMPLES = 16;

interface LampContextValue {
  setLayer(node: HTMLDivElement | null): void;
  api: LampApi;
}

const LampContext = createContext<LampContextValue | null>(null);

interface Point {
  x: number;
  y: number;
}

function isElement(point: LampPoint): point is Element {
  return typeof Element !== "undefined" && point instanceof Element;
}

function centerOf(point: LampPoint): Point {
  if (isElement(point)) {
    const r = point.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if ("width" in point && "height" in point) {
    return { x: point.x + point.width / 2, y: point.y + point.height / 2 };
  }
  return { x: point.x, y: point.y };
}

function isShown(el: Element): boolean {
  return el.getBoundingClientRect().width > 0;
}

function canAnimate(): boolean {
  return typeof Element !== "undefined" && typeof Element.prototype.animate === "function";
}

function findTarget(name: LampTargetName, from?: LampPoint): Element | null {
  if (typeof document === "undefined") return null;
  const candidates = Array.from(document.querySelectorAll(`[data-lamp-target="${name}"]`)).filter(isShown);
  if (candidates.length <= 1 || !from) return candidates[0] ?? null;
  const origin = centerOf(from);
  let best: Element | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const c = centerOf(candidate);
    const distance = Math.hypot(c.x - origin.x, c.y - origin.y);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function bumpElement(el: Element | null): void {
  if (!el || prefersReducedMotion() || !canAnimate()) return;
  el.animate([{ scale: "1" }, { scale: "1.12", offset: 0.35 }, { scale: "1" }], {
    duration: 450,
    easing: cubicBezier(EASE.outSoft),
  });
}

/**
 * 弧の道のりを点で写す。起点と行き先の中点を上へ `min(80px, 距離×0.3)` 持ち上げた点を通る2次ベジェ。
 * 真ん中で少し小さく（0.7）なる。点を細かく打つのは、3点だけだと折れ線になって弧に見えないため。
 */
export function arcKeyframes(a: Point, b: Point): Keyframe[] {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const lift = Math.min(80, distance * 0.3);
  const control = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - lift * 2 };
  const frames: Keyframe[] = [];
  for (let i = 0; i <= ARC_SAMPLES; i++) {
    const t = i / ARC_SAMPLES;
    const u = 1 - t;
    const x = u * u * a.x + 2 * u * t * control.x + t * t * b.x;
    const y = u * u * a.y + 2 * u * t * control.y + t * t * b.y;
    frames.push({ translate: `${x.toFixed(1)}px ${y.toFixed(1)}px`, scale: `${(1 - 0.3 * Math.sin(Math.PI * t)).toFixed(3)}` });
  }
  return frames;
}

function createFlyer(kind: NonNullable<FlyOptions["kind"]>, opts: FlyOptions): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = "lamp-fly";
  el.dataset.kind = kind;
  if (kind === "ribbon") {
    const ribbon = document.createElement("span");
    ribbon.className = "ribbon";
    ribbon.style.width = "10px";
    ribbon.style.height = "24px";
    el.appendChild(ribbon);
  } else if (kind === "stamp") {
    const glyph = opts.glyph ?? "静";
    const stamp = document.createElement("span");
    stamp.className = "stamp";
    stamp.dataset.tone = opts.tone ?? "quiet";
    stamp.style.setProperty("--sz", "48px");
    stamp.style.fontSize = `${stampFontSize(48, glyph)}px`;
    stamp.textContent = glyph;
    el.appendChild(stamp);
  }
  return el;
}

const NOOP_API: LampApi = {
  fly(_from, _to, opts) {
    opts?.onArrive?.();
  },
  target() {
    return null;
  },
  bump() {},
};

/** 灯りの層の API を渡す。`MotionRoot` の中に1つだけ置く。 */
export function LampProvider({ children }: { children: ReactNode }) {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const flyingRef = useRef(0);

  const fly = useCallback<LampApi["fly"]>((from, to, opts = {}) => {
    let arrived = false;
    const arrive = () => {
      if (arrived) return;
      arrived = true;
      opts.onArrive?.();
    };
    const layer = layerRef.current;
    // reduce: 飛ばない。行き先が要素なら、その場で 120ms で明るくなってから着いたことにする（opacity だけ。§3.6）
    if (prefersReducedMotion()) {
      if (isElement(to) && canAnimate()) {
        to.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: REDUCED_ARRIVE_MS, easing: cubicBezier(EASE.outSoft) }).finished.then(
          arrive,
          arrive,
        );
      } else {
        arrive();
      }
      return;
    }
    if (!layer || !canAnimate() || flyingRef.current >= MAX_FLYING) {
      arrive();
      return;
    }
    // 起点は呼んだ瞬間に測る（起点の要素がその後消えてもよい）。
    const start = centerOf(from);
    flyingRef.current += 1;
    const release = () => {
      flyingRef.current = Math.max(0, flyingRef.current - 1);
    };
    const begin = () => {
      const end = centerOf(to);
      const duration = opts.duration ?? DEFAULT_DURATION;
      const delay = opts.delay ?? 0;
      const kind = opts.kind ?? "lamp";
      const el = createFlyer(kind, opts);
      layer.appendChild(el);
      const move = el.animate(arcKeyframes(start, end), {
        duration,
        delay,
        easing: cubicBezier(EASE.draw),
        fill: "both",
      });
      // 待っている間は見えず、着いたら 120ms で消える（本体は opacity: 0 から始まる）。
      const total = duration + FADE_OUT_MS;
      const fade = el.animate(
        [
          { opacity: 1, offset: 0 },
          { opacity: 1, offset: duration / total },
          { opacity: 0, offset: 1 },
        ],
        { duration: total, delay, fill: "none" },
      );
      move.finished.then(arrive, arrive);
      fade.finished
        .catch(() => undefined)
        .then(() => {
          el.remove();
          release();
        });
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(begin);
    else begin();
  }, []);

  const api = useMemo<LampApi>(() => ({ fly, target: findTarget, bump: bumpElement }), [fly]);
  const setLayer = useCallback((node: HTMLDivElement | null) => {
    layerRef.current = node;
  }, []);
  const value = useMemo(() => ({ api, setLayer }), [api, setLayer]);

  return <LampContext.Provider value={value}>{children}</LampContext.Provider>;
}

/**
 * 画面の一番上に1枚だけ置く灯りの層（`position: fixed; inset: 0; pointer-events: none; z-index: 60`）。
 * 遷移の間も生の層をいちばん上に描くよう `view-transition-name: lamp-layer` を持つ。
 */
export function LampLayer() {
  const context = useContext(LampContext);
  return (
    <div
      ref={context?.setLayer}
      className="lamp-layer"
      aria-hidden="true"
      style={{ viewTransitionName: "lamp-layer" }}
    />
  );
}

/** 灯りの層の API。Provider が無い所（単体テスト）では何も飛ばさず、onArrive だけをすぐ呼ぶ。 */
export function useLamp(): LampApi {
  return useContext(LampContext)?.api ?? NOOP_API;
}
