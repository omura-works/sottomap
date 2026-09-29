"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { EASE, SPRING } from "@/components/motion/tokens";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
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
 * - 選ばれている丸の右上に「ナビの灯り」（`layoutId="nav-lamp"`）。タブを移ると前の丸から渡り、少し上に弧を描く。
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
        {active ? (
          <motion.span
            layoutId="nav-lamp"
            className="nav-lamp"
            aria-hidden="true"
            transition={reduced ? { duration: 0 } : SPRING.settle}
          >
            <motion.span
              className="nav-lamp-core"
              initial={arc ? { y: 0 } : false}
              animate={arc ? { y: [0, -6, 0] } : { y: 0 }}
              transition={{ duration: 0.6, ease: EASE.outSoft }}
            />
          </motion.span>
        ) : null}
        <NavPending />
      </span>
      <span>{item.label}</span>
    </Link>
  );
}
