"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { MouseEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { addBookmarkAction } from "@/app/actions/bookmark-actions";
import { Button } from "@/components/ui";
import type { ButtonVariant } from "@/components/ui";
import { useLamp } from "@/components/motion/LampLayer";
import { Lantern } from "@/components/illustrations/Lantern";

interface AddBookmarkButtonProps {
  spotId: string;
  initiallyBookmarked: boolean;
  variant: ButtonVariant;
}

/** 栞に挟んだ瞬間（楽観的な表示と同時）に出す。地図のピン・詳細の写真のリボンが聞く（SPEC motion §5.2 末尾）。 */
export const BOOKMARKED_EVENT = "sotto:bookmarked";
/** 失敗して楽観的な表示を戻したときに出す。 */
export const BOOKMARK_FAILED_EVENT = "sotto:bookmark-failed";

export interface BookmarkEventDetail {
  spotId: string;
}

function emit(name: string, spotId: string) {
  window.dispatchEvent(new CustomEvent<BookmarkEventDetail>(name, { detail: { spotId } }));
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
  const lamp = useLamp();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // SPEC motion §7.2-8: (1) 飛ばす物の位置を測る → (2) 状態の更新・送信をすぐ行う → (3) 飛行は次のフレームから
    const button = event.currentTarget;
    const target = lamp.target("bookmarks", button);
    if (target) {
      lamp.fly(button, target, { kind: "ribbon", onArrive: () => lamp.bump(target) });
    }
    setErrorMessage(null);
    emit(BOOKMARKED_EVENT, spotId);
    startTransition(async () => {
      setOptimisticBookmarked(true);
      try {
        await addBookmarkAction(spotId);
        setBookmarked(true);
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        emit(BOOKMARK_FAILED_EVENT, spotId);
        setErrorMessage("ごめんなさい、栞に挟めませんでした。もう一度押してみてください。");
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
        <span className="inline-alert alert-in text-xs" role="status">
          <Lantern size={16} tone="paper" />
          {errorMessage}
        </span>
      ) : null}
    </div>
  );
}
