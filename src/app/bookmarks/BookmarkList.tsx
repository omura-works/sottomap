"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { removeBookmarkAction } from "@/app/actions/bookmark-actions";
import { formatPlannedAt } from "./format-planned-at";

export interface BookmarkListItem {
  id: string;
  spotId: string;
  citySlug: string;
  cityName: string;
  areaName: string | null;
  spotName: string;
  photoUrl: string | null;
  plannedAt: string | null;
}

type ListAction = { type: "remove"; id: string };

/**
 * S8「挟んだ店」のリスト＋「N軒を地図にまとめる」導線。
 * 削除は Server Action（`removeBookmarkAction`）＋ `useOptimistic` で
 * 即座にリストから消す。
 *
 * 「N軒を地図にまとめる」は複数の街をまたいで栞がある場合、地図(S2)が
 * 単一の街ページである都合上、件数が最も多い街のスポットだけを
 * `?spots=id1,id2,...` に載せる（他都市の栞は含まれない）。
 */
export function BookmarkList({ initialItems }: { initialItems: BookmarkListItem[] }) {
  const [isPending, startTransition] = useTransition();
  const [items, dispatch] = useOptimistic(initialItems, (state: BookmarkListItem[], action: ListAction) => {
    if (action.type === "remove") {
      return state.filter((item) => item.id !== action.id);
    }
    return state;
  });

  function handleRemove(id: string) {
    startTransition(async () => {
      dispatch({ type: "remove", id });
      await removeBookmarkAction(id);
    });
  }

  if (items.length === 0) {
    return <p className="text-muted">まだ栞に挟んだ店がありません。</p>;
  }

  const countByCity = new Map<string, number>();
  for (const item of items) {
    countByCity.set(item.citySlug, (countByCity.get(item.citySlug) ?? 0) + 1);
  }
  let mapCitySlug = items[0].citySlug;
  let mapCityMax = 0;
  for (const [slug, count] of countByCity) {
    if (count > mapCityMax) {
      mapCityMax = count;
      mapCitySlug = slug;
    }
  }
  const mapSpotIds = items.filter((item) => item.citySlug === mapCitySlug).map((item) => item.spotId);
  const mapHref = `/${mapCitySlug}?spots=${mapSpotIds.join(",")}`;

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {items.map((item) => {
          const plannedLabel = formatPlannedAt(item.plannedAt);
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
                <p className="m-0 text-muted text-xs">
                  {[item.cityName, item.areaName].filter(Boolean).join("・")}
                  {plannedLabel ? ` / ${plannedLabel}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => handleRemove(item.id)}
                disabled={isPending}
                aria-label={`${item.spotName}を栞から外す`}
              >
                外す
              </button>
            </li>
          );
        })}
      </ul>

      <Link href={mapHref} className="btn btn-primary btn-block">
        {items.length}軒を地図にまとめる
      </Link>
    </div>
  );
}
