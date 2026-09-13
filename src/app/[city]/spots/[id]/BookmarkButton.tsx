"use client";

import { AddBookmarkButton } from "@/components/bookmark/AddBookmarkButton";

/**
 * S4「栞に挟む」ボタン。`useOptimistic` で即座に確定済み表示へ切り替える
 * （ボタン自体の文言「栞に挟む」は Spec §4 の一字一句そのままを保つため変えず、
 * 押下後の状態は下に小さな確認テキストで表す）。
 */
export function BookmarkButton({ spotId, initiallyBookmarked }: { spotId: string; initiallyBookmarked: boolean }) {
  return <AddBookmarkButton spotId={spotId} initiallyBookmarked={initiallyBookmarked} variant="primary" />;
}
