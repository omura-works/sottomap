"use client";

import { useEffect, useState } from "react";
import type { AnimationEvent } from "react";
import { BOOKMARK_FAILED_EVENT, BOOKMARKED_EVENT } from "@/components/bookmark/AddBookmarkButton";
import type { BookmarkEventDetail } from "@/components/bookmark/AddBookmarkButton";
import { prefersReducedMotion } from "@/components/ui/motion-prefs";

type RibbonState = "off" | "on" | "tucking" | "leaving";

function spotIdOf(event: Event): string | undefined {
  return event instanceof CustomEvent ? (event as CustomEvent<BookmarkEventDetail>).detail?.spotId : undefined;
}

/**
 * 写真の栞のリボン（SPEC motion §5.4）。挟んでいるとき（最初から挟んでいた／`sotto:bookmarked` でこの店が来た）だけ見える。
 * 挟んだ瞬間は上からするりと入り（止まった後に1回ゆれる）、`sotto:bookmark-failed` で上へ抜ける。
 * 状態はボタンの字「栞に挟みました。」で伝わっているので、飾りとして `aria-hidden`。
 */
export function PhotoRibbon({ spotId, initiallyBookmarked }: { spotId: string; initiallyBookmarked: boolean }) {
  const [state, setState] = useState<RibbonState>(initiallyBookmarked ? "on" : "off");

  useEffect(() => {
    const onBookmarked = (event: Event) => {
      if (spotIdOf(event) !== spotId) return;
      setState((current) => (current === "on" || current === "tucking" ? current : prefersReducedMotion() ? "on" : "tucking"));
    };
    const onFailed = (event: Event) => {
      if (spotIdOf(event) !== spotId) return;
      setState((current) => (current === "off" ? "off" : prefersReducedMotion() ? "off" : "leaving"));
    };
    window.addEventListener(BOOKMARKED_EVENT, onBookmarked);
    window.addEventListener(BOOKMARK_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener(BOOKMARKED_EVENT, onBookmarked);
      window.removeEventListener(BOOKMARK_FAILED_EVENT, onFailed);
    };
  }, [spotId]);

  if (state === "off") return null;

  const onAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    if (event.target !== event.currentTarget) return;
    if (state === "leaving" && event.animationName === "photo-ribbon-out") setState("off");
    if (state === "tucking" && event.animationName === "v-sway") setState("on");
  };

  const className =
    state === "tucking" ? "ribbon photo-ribbon verb-tuck" : state === "leaving" ? "ribbon photo-ribbon is-leaving" : "ribbon photo-ribbon";

  return (
    <span className="photo-rb-box" aria-hidden="true">
      <span className={className} onAnimationEnd={onAnimationEnd} />
    </span>
  );
}
