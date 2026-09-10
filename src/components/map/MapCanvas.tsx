"use client";

// MapLibre GL JS の薄いラッパ（Task 3 所有）。
// SSR 非対応のため、必ず `./index.tsx` 経由（next/dynamic, ssr:false）で読み込むこと。
//
// 地図タイル: 国土地理院 淡色地図。出典表記「地理院タイル」は画面に必ず表示する
// （PLAN Task3 / SPEC §6）。タイルURLは差し替え可能な設定値（props.tileUrlTemplate）にする。
//
// ピンは静けさ（quiet/crowding/touristy）で色を変えるが、色だけで伝えないよう
// 必ず短い文字グリフを併記する（SPEC §8）。

import { useEffect, useRef } from "react";
// maplibre-gl v6 は default export を持たないため名前空間 import を使う。
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Quietness } from "@/lib/db/types";
import { quietnessLabel } from "@/lib/domain/quietness";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  quietness: Quietness;
  label: string;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapCanvasProps {
  center: { lat: number; lng: number };
  zoom?: number;
  pins: MapPin[];
  selectedId?: string | null;
  onSelectPin?: (id: string) => void;
  onHoverPin?: (id: string | null, point: MapPoint | null) => void;
  onBackgroundClick?: () => void;
  /** true の間、pins の緯度経度が収まるよう地図を自動でフィットする（栞からの「地図にまとめる」等）。 */
  fitToPins?: boolean;
  className?: string;
  /** 国土地理院タイル以外に差し替え可能にするための設定値。既定は淡色地図。 */
  tileUrlTemplate?: string;
  /** 出典表記。既定は「地理院タイル」。 */
  attribution?: string;
}

export const DEFAULT_TILE_URL_TEMPLATE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
export const DEFAULT_ATTRIBUTION = "地理院タイル";
const GSI_SOURCE_ID = "gsi-pale";
const GSI_LAYER_ID = "gsi-pale-layer";

const QUIETNESS_STYLE: Record<Quietness, { bg: string; fg: string; glyph: string }> = {
  quiet: { bg: "var(--color-accent-2-600)", fg: "var(--color-bg)", glyph: "静" },
  crowding: { bg: "var(--color-accent-600)", fg: "var(--color-bg)", glyph: "並" },
  touristy: { bg: "var(--color-neutral-600)", fg: "var(--color-bg)", glyph: "観" },
};

function createMarkerElement(pin: MapPin, selected: boolean): HTMLDivElement {
  const style = QUIETNESS_STYLE[pin.quietness];
  const el = document.createElement("div");
  el.setAttribute("role", "button");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", `${pin.label}・${quietnessLabel(pin.quietness)}`);
  el.title = `${pin.label}（${quietnessLabel(pin.quietness)}）`;
  el.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "width:30px",
    "height:30px",
    "border-radius:999px",
    `background:${style.bg}`,
    `color:${style.fg}`,
    "font-family:var(--font-heading), system-ui, sans-serif",
    "font-weight:700",
    "font-size:13px",
    "line-height:1",
    "cursor:pointer",
    "box-shadow:var(--shadow-md)",
    `border:${selected ? "3px solid var(--color-text)" : "2px solid var(--color-bg)"}`,
    "transform:translateZ(0)",
  ].join(";");
  el.textContent = style.glyph;
  return el;
}

/**
 * MapLibre GL JS の薄いラッパ本体。
 * ピンの選択/ホバーはコールバックで通知するのみで、実際のカードUI（カード/一覧の
 * ハイライト等）は呼び出し側（`@/components/map/CityMapScreen` 等）が
 * `@/components/ui` の共通コンポーネントで描画する。
 */
export function MapCanvas({
  center,
  zoom = 13,
  pins,
  selectedId = null,
  onSelectPin,
  onHoverPin,
  onBackgroundClick,
  fitToPins = false,
  className,
  tileUrlTemplate = DEFAULT_TILE_URL_TEMPLATE,
  attribution = DEFAULT_ATTRIBUTION,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
  const hoveredIdRef = useRef<string | null>(null);

  // コールバック類は毎レンダーで新しい参照になり得るため ref 経由で最新を参照する
  // （地図・マーカーの再生成を避けるため）。ref の更新はレンダー本体ではなく
  // effect 内で行う（react-hooks/refs: レンダー中の ref 更新は禁止）。
  const callbacksRef = useRef({ onSelectPin, onHoverPin, onBackgroundClick });
  useEffect(() => {
    callbacksRef.current = { onSelectPin, onHoverPin, onBackgroundClick };
  }, [onSelectPin, onHoverPin, onBackgroundClick]);

  // 地図の初期化（マウント時に一度だけ）。
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          [GSI_SOURCE_ID]: {
            type: "raster",
            tiles: [tileUrlTemplate],
            tileSize: 256,
            attribution,
          },
        },
        layers: [
          {
            id: GSI_LAYER_ID,
            type: "raster",
            source: GSI_SOURCE_ID,
          },
        ],
      },
      center: [center.lng, center.lat],
      zoom,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("click", (event) => {
      // マーカー要素上のクリックは個別ハンドラで stopPropagation 済みなので、
      // ここに来るのは背景（地図そのもの）のクリックのみ。
      if (event.originalEvent.defaultPrevented) return;
      callbacksRef.current.onBackgroundClick?.();
    });

    mapRef.current = map;
    const markers = markersRef.current;

    // コンテナは `h-[calc(100dvh-4rem)]` 等のCSSで決まるため、初期化直後の
    // レイアウト確定（フォント読み込み・dvh再計算等）より前にサイズを掴んでしまうことがある。
    // ResizeObserver で実サイズの変化を監視し、その都度 resize() して描画のズレを防ぐ
    // （これが無いと、コンテナの最終サイズがあとから確定した場合にタイルが
    // 左上寄りの一部にしか描画されない不具合が起きる）。
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
    // 初期化は一度きり。center/zoom の以後の変化は fitToPins 側で扱う。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ピンの差分更新。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const nextIds = new Set(pins.map((p) => p.id));

      // 消えたピンを除去。
      for (const [id, marker] of markersRef.current) {
        if (!nextIds.has(id)) {
          marker.remove();
          markersRef.current.delete(id);
        }
      }

      for (const pin of pins) {
        const selected = pin.id === selectedId;
        const existing = markersRef.current.get(pin.id);

        if (existing) {
          existing.setLngLat([pin.lng, pin.lat]);
          const el = existing.getElement();
          const style = QUIETNESS_STYLE[pin.quietness];
          el.style.border = selected ? "3px solid var(--color-text)" : "2px solid var(--color-bg)";
          el.style.background = style.bg;
          el.textContent = style.glyph;
          el.title = `${pin.label}（${quietnessLabel(pin.quietness)}）`;
          continue;
        }

        const el = createMarkerElement(pin, selected);

        // SPEC §9.10: D1 のホバーカードはホバー・フォーカス・タップの3つで
        // 同等に開く必要がある。マウス(mouseenter/leave)に加えて、キーボード
        // フォーカス(focus/blur)とタップ(click/keydown)でも同じ通知を出す。
        const emitHoverEnter = () => {
          hoveredIdRef.current = pin.id;
          const point = map.project([pin.lng, pin.lat]);
          callbacksRef.current.onHoverPin?.(pin.id, { x: point.x, y: point.y });
        };
        const emitHoverLeave = () => {
          if (hoveredIdRef.current === pin.id) {
            hoveredIdRef.current = null;
            callbacksRef.current.onHoverPin?.(null, null);
          }
        };

        el.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          emitHoverEnter();
          callbacksRef.current.onSelectPin?.(pin.id);
        });
        el.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            emitHoverEnter();
            callbacksRef.current.onSelectPin?.(pin.id);
          }
        });
        el.addEventListener("mouseenter", emitHoverEnter);
        el.addEventListener("mouseleave", emitHoverLeave);
        el.addEventListener("focus", emitHoverEnter);
        el.addEventListener("blur", emitHoverLeave);

        const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([pin.lng, pin.lat]).addTo(map);
        markersRef.current.set(pin.id, marker);
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [pins, selectedId]);

  // ホバー中のピンが地図の移動・ズームで位置を変えたら、カード座標を追随させる。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMove = () => {
      const id = hoveredIdRef.current;
      if (!id) return;
      const pin = pins.find((p) => p.id === id);
      if (!pin) return;
      const point = map.project([pin.lng, pin.lat]);
      callbacksRef.current.onHoverPin?.(id, { x: point.x, y: point.y });
    };

    map.on("move", handleMove);
    return () => {
      map.off("move", handleMove);
    };
  }, [pins]);

  // center/zoom の変更、または fitToPins 指定時のピン群フィット。
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const run = () => {
      if (fitToPins && pins.length > 0) {
        const bounds = pins.reduce(
          (b, pin) => b.extend([pin.lng, pin.lat]),
          new maplibregl.LngLatBounds([pins[0].lng, pins[0].lat], [pins[0].lng, pins[0].lat]),
        );
        map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 0 });
      } else {
        map.jumpTo({ center: [center.lng, center.lat], zoom });
      }
    };

    if (map.isStyleLoaded()) {
      run();
    } else {
      map.once("load", run);
    }
    // pins は fitToPins=true のときだけ意味を持つため、参照だけ見て良い。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, zoom, fitToPins]);

  return (
    <div className={className} style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} aria-label="地図" />
      {/* 出典表記（SPEC §6: 地図タイルの出典表示必須）。折りたたみ式コントロールに頼らず常時表示する。 */}
      <div
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          zIndex: 5,
          fontSize: 10,
          padding: "1px 6px",
          borderRadius: 999,
          background: "color-mix(in srgb, var(--color-bg) 78%, transparent)",
          color: "var(--color-text)",
          pointerEvents: "none",
        }}
      >
        {attribution}
      </div>
    </div>
  );
}
