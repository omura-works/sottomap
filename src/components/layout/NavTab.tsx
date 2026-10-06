"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { cubicBezier, DUR, EASE } from "@/components/motion/tokens";
import { prefersReducedMotion, usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { markNavigation } from "@/components/motion/nav-intent";
import { NavIcon } from "./NavIcon";
import { NavPending } from "./NavPending";
import { isNavItemActive, navDirection } from "./nav-items";
import type { NavItem } from "./nav-items";

/**
 * ページが変わったことがあるか（最初に開いたページでは、灯りを弾ませない）。
 * 前の描画の pathname と比べて調整する（React 公式の「前の描画の情報を持つ」パターン）。
 */
export function useHasNavigated(pathname: string): boolean {
  const [previous, setPrevious] = useState(pathname);
  const [moved, setMoved] = useState(false);
  if (previous !== pathname) {
    setPrevious(pathname);
    setMoved(true);
  }
  return moved;
}

export interface NavTabProps {
  item: NavItem;
  pathname: string;
  /** 左ナビ（丸 44px・丸＋ラベル）か、下部タブ（丸 36px・高さ 64px の列）か。 */
  variant: "rail" | "tabs";
  /** ページが一度でも変わったか（灯りが渡るときだけ、少し上に弧を描く）。 */
  moved: boolean;
}

/**
 * ナビの1つのタブ（SPEC motion §4.1.1・§5.0）。
 * - 選ばれている丸の右上に「ナビの灯り」（`NavLamp`）。タブを移ると前の丸から渡り、少し上に弧を描く。
 * - 灯りが着くと、丸（`::before` の accent-200）が判子のように押され、アイコンが1回だけ動く（CSS）。
 * - タブの向きでページの切り替えの型（page-forward / page-back）を付ける。
 * - 移動が 400ms を超えたら、その丸に呼吸する輪（`NavPending`）。
 * - 栞の丸は、栞に挟んだリボンが飛んでくる行き先（`data-lamp-target="bookmarks"`）。
 */
export function NavTab({ item, pathname, variant, moved }: NavTabProps) {
  const reduced = usePrefersReducedMotion();
  const active = isNavItemActive(item, pathname);
  const direction = navDirection(pathname, item.key);
  const arc = moved && !reduced;

  return (
    <Link
      href={item.href}
      transitionTypes={direction ? [direction] : undefined}
      onClick={direction ? () => markNavigation(direction) : undefined}
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : undefined}
      className={
        variant === "rail"
          ? "nav-item flex min-w-16 flex-col items-center gap-1 text-[12px] leading-[1.4] tracking-[0.06em] no-underline"
          : "nav-item flex-1 flex h-[63px] flex-col items-center justify-center gap-0.5 text-[12px] leading-[1.4] tracking-[0.06em] no-underline"
      }
      style={{
        color: active ? "var(--color-accent-700)" : "var(--color-text-muted)",
        fontWeight: 400,
      }}
    >
      <span
        className={variant === "rail" ? "nav-icon-frame h-11 w-11" : "nav-icon-frame h-9 w-9"}
        data-lamp-target={item.key === "bookmarks" ? "bookmarks" : undefined}
      >
        <NavIcon name={item.key} active={active} />
        {active ? <NavLamp variant={variant} arc={arc} /> : null}
        <NavPending />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}

/**
 * 前に灯りがあった位置（ナビの `<nav>` の左上から測る。ページのスクロールに左右されない）。左ナビと下部タブで別々に持つ。
 * 灯りはタブを移るたびに前のタブで消え、新しいタブで生まれるので、生まれたときにここから渡らせる（FLIP）。
 */
const lastLampPosition = new Map<NavTabProps["variant"], { x: number; y: number }>();

/** テスト用: 覚えている位置を消す。 */
export function resetNavLampMemory(): void {
  lastLampPosition.clear();
}

function springSettle(): string {
  if (typeof document === "undefined") return cubicBezier(EASE.outSoft);
  const value = getComputedStyle(document.documentElement).getPropertyValue("--spring-settle").trim();
  return value || cubicBezier(EASE.outSoft);
}

/**
 * ナビの灯り（SPEC motion §4.1.1）。motion の `layoutId` の代わりに、前の位置から `translate` で渡す（WAAPI）。
 * 全ページで読む JS を軽くするため motion を使わない（P7）。渡り方は `--spring-settle`（600ms）、芯は 600ms で少し上に弧を描く。
 */
function NavLamp({ variant, arc }: { variant: NavTabProps["variant"]; arc: boolean }) {
  const lampRef = useRef<HTMLSpanElement | null>(null);
  const coreRef = useRef<HTMLSpanElement | null>(null);
  useLayoutEffect(() => {
    const lamp = lampRef.current;
    if (!lamp) return;
    const nav = lamp.closest("nav");
    const rect = lamp.getBoundingClientRect();
    if (!nav || (rect.width === 0 && rect.height === 0)) return; // 隠れている方のナビ（PC/スマホの片方）
    const origin = nav.getBoundingClientRect();
    const now = { x: rect.left - origin.left, y: rect.top - origin.top };
    const previous = lastLampPosition.get(variant);
    lastLampPosition.set(variant, now);
    if (!previous || prefersReducedMotion() || typeof lamp.animate !== "function") return;
    const dx = previous.x - now.x;
    const dy = previous.y - now.y;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    lamp.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0 0" }], { duration: DUR.settle, easing: springSettle() });
    if (arc && coreRef.current && typeof coreRef.current.animate === "function") {
      coreRef.current.animate([{ translate: "0 0" }, { translate: "0 -6px" }, { translate: "0 0" }], {
        duration: 600,
        easing: cubicBezier(EASE.outSoft),
      });
    }
  }, [variant, arc]);
  return (
    <span ref={lampRef} className="nav-lamp" aria-hidden="true">
      <span ref={coreRef} className="nav-lamp-core" />
    </span>
  );
}
