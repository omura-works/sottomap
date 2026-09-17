"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { removeBookmarkAction } from "@/app/actions/bookmark-actions";

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
 */
export function BookmarkList({ initialItems }: { initialItems: BookmarkListItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  function handleRemove(item: BookmarkListItem, index: number) {
    setErrorMessage(null);
    startTransition(async () => {
      dispatch({ type: "remove", id: item.id });
      try {
        await removeBookmarkAction(item.spotId);
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        dispatch({ type: "restore", item, index });
        setErrorMessage("栞から外せませんでした。");
      }
    });
  }

  if (items.length === 0) {
    return <p className="text-muted">まだ栞に挟んだ店がありません。</p>;
  }

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
      <ul className="space-y-2">
        {items.map((item) => {
          const index = items.indexOf(item);
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 px-3 py-2"
              style={{ borderRadius: "var(--radius-md)", background: "var(--color-surface)" }}
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
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleRemove(item, index)}
                disabled={isPending}
                aria-label={`${item.spotName}を栞から外す`}
              >
                外す
              </button>
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
    </div>
  );
}
