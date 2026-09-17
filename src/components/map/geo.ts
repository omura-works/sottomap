// 地図・検索まわりの位置計算ヘルパー（Task 3 所有）。
// 「位置情報が取れない場合は街の中心からの距離で代替」（PLAN Task3）を満たすための
// 現在地取得フック、距離計算、徒歩分数ラベル、街内の代表エリア名の推定を提供する。

"use client";

import { useEffect, useState } from "react";
import type { Spot } from "@/lib/db/types";
import { computeWalkMinutes, haversineMeters, WITHIN_10MIN_METERS } from "@/lib/domain/geo";
import type { LatLng } from "@/lib/domain/geo";

export type { LatLng } from "@/lib/domain/geo";

/** 現在地取得のタイムアウト（これを超えたら街の中心へフォールバックする）。 */
const GEOLOCATION_TIMEOUT_MS = 4000;

/** 2点間の距離（メートル）。 */
export const distanceMeters = haversineMeters;

/** メートル距離を「徒歩N分」ラベルに変換する（切り上げ、最低1分）。 */
export const walkingMinutes = computeWalkMinutes;

export function walkingLabel(meters: number): string {
  return `徒歩${walkingMinutes(meters)}分`;
}

/** 絞り込みチップ「徒歩10分」の判定に使う距離しきい値（メートル）。サーバー（db/spots.ts）と共通。 */
export { WITHIN_10MIN_METERS };

/**
 * 現在地（Geolocation API）を取得し、失敗・拒否・タイムアウト時は
 * 渡された街の中心座標にフォールバックするフック。
 * 戻り値の `resolved` が true になるまでは fallback をそのまま返す
 * （表示上は街中心からの距離として扱って問題ない）。
 */
export function useOrigin(fallback: LatLng): { origin: LatLng; resolved: boolean; isPrecise: boolean } {
  const [state, setState] = useState<{ origin: LatLng; resolved: boolean; isPrecise: boolean }>({
    origin: fallback,
    resolved: false,
    isPrecise: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // effect本体で同期的に setState しない（react-hooks/set-state-in-effect）。
      // マイクロタスクへずらして、非同期コールバック経由の更新に揃える。
      queueMicrotask(() => {
        if (!cancelled) setState({ origin: fallback, resolved: true, isPrecise: false });
      });
      return () => {
        cancelled = true;
      };
    }

    const timer = setTimeout(() => {
      if (!cancelled) {
        setState({ origin: fallback, resolved: true, isPrecise: false });
      }
    }, GEOLOCATION_TIMEOUT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(timer);
        if (cancelled) return;
        setState({
          origin: { lat: position.coords.latitude, lng: position.coords.longitude },
          resolved: true,
          isPrecise: true,
        });
      },
      () => {
        clearTimeout(timer);
        if (cancelled) return;
        setState({ origin: fallback, resolved: true, isPrecise: false });
      },
      { timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 },
    );

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // fallback は街を切り替えない限り安定した値のため依存に含めない
    // （毎レンダー新規オブジェクトになるとタイマーが回り続けてしまう）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallback.lat, fallback.lng]);

  return state;
}

/** 表示中のスポット群から距離マップ（spotId → メートル）を作る。 */
export function buildDistanceMap(spots: Spot[], origin: LatLng): Record<string, number> {
  const map: Record<string, number> = {};
  for (const spot of spots) {
    map[spot.id] = distanceMeters(origin, { lat: spot.lat, lng: spot.lng });
  }
  return map;
}

/**
 * 街のヘッダー見出し（例:「札幌・北24条」）に使う代表エリア名を推定する。
 * City にはエリア概念が無いため、表示中スポットの areaName の最頻値を採用する。
 * 該当が無ければ null（呼び出し側は市区町村名のみ表示する）。
 */
export function mostCommonAreaName(spots: Spot[]): string | null {
  const counts = new Map<string, number>();
  for (const spot of spots) {
    if (!spot.areaName) continue;
    counts.set(spot.areaName, (counts.get(spot.areaName) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [area, count] of counts) {
    if (count > bestCount) {
      best = area;
      bestCount = count;
    }
  }
  return best;
}
