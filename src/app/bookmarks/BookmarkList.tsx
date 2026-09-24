"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { removeBookmarkAction } from "@/app/actions/bookmark-actions";
import { ConfirmRemoveButton, useIntroStagger } from "@/components/ui";
import { cn } from "@/components/ui/cn";

/** ページ側（`/bookmarks`）の見出し。行の前後どちらも無いときのフォーカス先（Codex R8 重要3）。 */
const BOOKMARKS_HEADING_ID = "bookmarks-heading";

export interface BookmarkListItem {
  id: string;
  spotId: string;
  citySlug: string;
  cityName: string;
  areaName: string | null;
  spotName: string;
  photoUrl: string | null;
  plannedAt: string | null;
  meta: string;
}

type ListAction =
  | { type: "remove"; id: string }
  | { type: "restore"; item: BookmarkListItem; index: number };

/**
 * S8「挟んだ店」のリスト＋「N軒を地図にまとめる」導線。
 * 削除は Server Action（`removeBookmarkAction`）＋ `useOptimistic` で
 * 即座にリストから消し、失敗時は元の位置に戻して `role="alert"` で知らせる
 * （SPEC §9.14-7）。
 *
 * 「N軒を地図にまとめる」は、栞が単一の街だけなら「N軒を地図にまとめる」のまま。
 * 複数の街にまたがるときは街ごとにボタンを分け、「{街名}のN軒を地図にまとめる」とする
 * （SPEC §9.14-4: 表示件数と渡す件数を一致させる）。
 *
 * Codex R8 重要3: 「外す」確定で行自体がアンマウントされるため、`ConfirmRemoveButton` 内蔵の
 * ライブリージョンではなく、行が消えても残るこの一覧レベルのライブリージョンで
 * 「栞から外しました。」「そのままにしました。」を知らせる。フォーカスは、外した直後は
 * 次の行→無ければ前の行→どちらも無ければ一覧の見出しへ、ロールバック時は復元した行の
 * 「外す」ボタンへ移す。
 */
export function BookmarkList({ initialItems }: { initialItems: BookmarkListItem[] }) {
  const [, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  const [items, dispatch] = useOptimistic(initialItems, (state: BookmarkListItem[], action: ListAction) => {
    if (action.type === "remove") {
      return state.filter((item) => item.id !== action.id);
    }
    if (action.type === "restore") {
      const next = state.slice();
      next.splice(Math.min(action.index, next.length), 0, action.item);
      return next;
    }
    return state;
  });

  // ロールバックで復元された行が再マウントされ、ref が登録されてから初めてフォーカスできる。
  useEffect(() => {
    if (!pendingFocusId) return;
    const target = triggerRefs.current.get(pendingFocusId);
    if (target) {
      target.focus();
      setPendingFocusId(null);
    }
  }, [pendingFocusId, items]);

  function focusNeighborOrHeading(nextId: string | undefined, prevId: string | undefined) {
    const target =
      (nextId && triggerRefs.current.get(nextId)) || (prevId && triggerRefs.current.get(prevId)) || null;
    if (target) {
      target.focus();
    } else {
      document.getElementById(BOOKMARKS_HEADING_ID)?.focus();
    }
  }

  // Codex R9 重要3: 同じ文言が連続しても読み上げられるよう、一度空にしてから
  // 次のティックで設定する（同期的に空→本文をまとめて設定すると、DOM上は本文しか
  // 変化せず、直前と同じ文言のときは再読み上げされない）。
  function announce(message: string) {
    setLiveMessage("");
    setTimeout(() => setLiveMessage(message), 0);
  }

  function handleRemove(item: BookmarkListItem, index: number) {
    const nextId = items[index + 1]?.id;
    const prevId = index > 0 ? items[index - 1]?.id : undefined;
    setErrorMessage(null);
    startTransition(async () => {
      dispatch({ type: "remove", id: item.id });
      focusNeighborOrHeading(nextId, prevId);
      try {
        // Codex R9 重要3: 成功通知はServer Actionの成功後に出す（失敗時に「外しました」を出さないため）。
        await removeBookmarkAction(item.spotId);
        announce(`${item.spotName}を栞から外しました。`);
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        dispatch({ type: "restore", item, index });
        setErrorMessage("栞から外せませんでした。");
        setPendingFocusId(item.id);
      }
    });
  }

  function handleCancel(item: BookmarkListItem) {
    announce(`${item.spotName}はそのままにしました。`);
  }

  // モーションリファレンス「リスト順次表示」: 初回表示の行だけ順に出す。
  // 外したときの並び替えやロールバックで戻った行では再生しない（フォーカス移動は上のまま）。
  const rowMotion = useIntroStagger(items.map((item) => item.id));

  const cityOrder: string[] = [];
  const itemsByCity = new Map<string, BookmarkListItem[]>();
  for (const item of items) {
    if (!itemsByCity.has(item.citySlug)) {
      cityOrder.push(item.citySlug);
      itemsByCity.set(item.citySlug, []);
    }
    itemsByCity.get(item.citySlug)!.push(item);
  }

  return (
    <div className="space-y-4">
      {/* Codex R9 重要3: 0件（早期return）でも常に描画する。行が消えても残るライブリージョン
          （Codex R8 重要3）。ConfirmRemoveButton 側は持たない。 */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {items.length === 0 ? (
        <p className="text-muted">まだ栞に挟んだ店がありません。</p>
      ) : (
        <>
          <ul className="space-y-2">
            {items.map((item) => {
              const index = items.indexOf(item);
              const motion = rowMotion(item.id);
              return (
                <li
                  key={item.id}
                  className={cn("flex items-center gap-3 px-3 py-2", motion?.className)}
                  style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)", ...motion?.style }}
                >
                  {item.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- 外部URLのサムネイルをそのまま表示する
                    <img src={item.photoUrl} alt={item.spotName} className="w-12 h-12 rounded-md object-cover flex-none" />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-md flex-none flex items-center justify-center text-muted text-[10px]"
                      style={{ background: "var(--color-neutral-200)" }}
                      aria-hidden
                    >
                      写真
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="m-0 truncate">{item.spotName}</p>
                    <p className="m-0 text-muted text-xs">{item.meta}</p>
                  </div>
                  <ConfirmRemoveButton
                    label={`${item.spotName}を栞から外す`}
                    onConfirm={() => handleRemove(item, index)}
                    onCancel={() => handleCancel(item)}
                    onTriggerRef={(node) => {
                      triggerRefs.current.set(item.id, node);
                    }}
                  />
                </li>
              );
            })}
          </ul>

          {errorMessage ? (
            <p role="alert" className="text-sm" style={{ color: "var(--color-accent-700)" }}>
              {errorMessage}
            </p>
          ) : null}

          {cityOrder.length <= 1 ? (
            <Link href={`/${cityOrder[0]}?spots=${items.map((item) => item.spotId).join(",")}`} className="btn btn-primary btn-block">
              {items.length}軒を地図にまとめる
            </Link>
          ) : (
            <div className="space-y-2">
              {cityOrder.map((citySlug) => {
                const cityItems = itemsByCity.get(citySlug)!;
                const cityName = cityItems[0].cityName;
                const spotIds = cityItems.map((item) => item.spotId).join(",");
                return (
                  <Link
                    key={citySlug}
                    href={`/${citySlug}?spots=${spotIds}`}
                    className="btn btn-primary btn-block"
                  >
                    {cityName}の{cityItems.length}軒を地図にまとめる
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
