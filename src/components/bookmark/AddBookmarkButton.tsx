"use client";

import { useOptimistic, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { addBookmarkAction } from "@/app/actions/bookmark-actions";
import { Button } from "@/components/ui";
import type { ButtonVariant } from "@/components/ui";

interface AddBookmarkButtonProps {
  spotId: string;
  initiallyBookmarked: boolean;
  variant: ButtonVariant;
}

/** 地図と詳細で共有する、失敗時ロールバック付きの栞追加ボタン。 */
export function AddBookmarkButton({ spotId, initiallyBookmarked, variant }: AddBookmarkButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(initiallyBookmarked);
  const [optimisticBookmarked, setOptimisticBookmarked] = useOptimistic(
    bookmarked,
    (_state: boolean, next: boolean) => next,
  );

  function handleClick() {
    setErrorMessage(null);
    startTransition(async () => {
      setOptimisticBookmarked(true);
      try {
        await addBookmarkAction(spotId);
        setBookmarked(true);
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        setErrorMessage("栞に挟めませんでした。");
      }
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button variant={variant} onClick={handleClick} disabled={isPending || optimisticBookmarked}>
        栞に挟む
      </Button>
      {optimisticBookmarked ? <span className="text-muted text-xs">栞に挟みました。</span> : null}
      {errorMessage ? (
        <span className="text-muted text-xs" role="status">
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
