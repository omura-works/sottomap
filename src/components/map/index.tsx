"use client";

// `MapCanvas` は maplibre-gl（ブラウザ専用）に依存するため、SSR を必ず回避する。
// 呼び出し側はこの index からのみ import すること（`./MapCanvas` を直接 import しない）。

import dynamic from "next/dynamic";
import type { MapCanvasProps } from "./MapCanvas";

export type { MapCanvasProps, MapPin, MapPoint } from "./MapCanvas";
export { DEFAULT_TILE_URL_TEMPLATE, DEFAULT_ATTRIBUTION } from "./MapCanvas";

function MapCanvasLoading() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-neutral-300)",
        color: "var(--color-text)",
        fontSize: 13,
        fontWeight: 400,
      }}
    >
      地図を読み込み中…
    </div>
  );
}

export const MapCanvas = dynamic<MapCanvasProps>(
  () => import("./MapCanvas").then((mod) => mod.MapCanvas),
  { ssr: false, loading: MapCanvasLoading },
);
