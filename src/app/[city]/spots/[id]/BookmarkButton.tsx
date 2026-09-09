"use client";

import { useOptimistic, useTransition } from "react";
import { Button } from "@/components/ui";
import { addBookmarkAction } from "@/app/actions/bookmark-actions";

/**
 * S4「栞に挟む」ボタン。`useOptimistic` で即座に確定済み表示へ切り替える
 * （ボタン自体の文言「栞に挟む」は Spec §4 の一字一句そのままを保つため変えず、
 * 押下後の状態は下に小さな確認テキストで表す）。
 */
export function BookmarkButton({ spotId, initiallyBookmarked }: { spotId: string; initiallyBookmarked: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [optimisticBookmarked, setOptimisticBookmarked] = useOptimistic(
    initiallyBookmarked,
    (_state: boolean, next: boolean) => next,
  );

  function handleClick() {
    startTransition(async () => {
      setOptimisticBookmarked(true);
      await addBookmarkAction(spotId);
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant="primary" onClick={handleClick} disabled={isPending || optimisticBookmarked}>
        栞に挟む
      </Button>
      {optimisticBookmarked ? <span className="text-muted text-xs">栞に挟みました。</span> : null}
    </div>
  );
}
