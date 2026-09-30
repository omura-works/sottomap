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
import { prefersReducedMotion } from "@/components/ui/motion-prefs";
import { tiltFromId } from "@/components/motion/tilt";
import { MapUnderlay } from "./MapUnderlay";
import {
  createPinElement,
  hasStamped,
  leavePin,
  markStamped,
  PIN_GLYPH,
  PIN_GROUND,
  playPinEntrance,
  setMarkerGlyph,
  setPinRibbon,
  spawnPinHalo,
} from "./pin-halo";

// MapLibre v6 は Worker の URL を import.meta.url から実行時に組み立てるため、
// Turbopack では Worker が配信されず 404 になる（タイルもピンも出なくなる）。
// predev/prebuild で public/maplibre/ に置いた Worker を明示的に指す
// （scripts/copy-maplibre-worker.mjs）。
const MAPLIBRE_WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  quietness: Quietness;
  label: string;
  /** 栞に挟んだ店（右上にリボン＋止まった光。SPEC motion §5.2.1）。 */
  bookmarked?: boolean;
  /** 変わるたびにそのピンの判子を押し直す（ピンを立てる画面のミニ地図で、タップのたびに変える数）。 */
  stampKey?: string;
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
  onBackgroundClick?: (point: { lat: number; lng: number }) => void;
  /** true の間、pins の緯度経度が収まるよう地図を自動でフィットする（栞からの「地図にまとめる」等）。 */
  fitToPins?: boolean;
  className?: string;
  /** 国土地理院タイル以外に差し替え可能にするための設定値。既定は淡色地図。 */
  tileUrlTemplate?: string;
  /** 出典表記。既定は「地理院タイル」。 */
  attribution?: string;
  /**
   * 初回の判子の再生のキー（街の slug）。同じタブで同じキーの地図を2回目に開いたときは、判子の代わりにフェードで出す
   * （`sessionStorage` の `sotto:stamped:{introKey}`）。無ければ毎回判子。
   */
  introKey?: string;
  /** 地図の div の下に紙の地図（`MapUnderlay`）を敷く。既定 true。 */
  underlay?: boolean;
}

export const DEFAULT_TILE_URL_TEMPLATE = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
export const DEFAULT_ATTRIBUTION = "地理院タイル";
const GSI_SOURCE_ID = "gsi-pale";
const GSI_LAYER_ID = "gsi-pale-layer";

/** 判子を押すのは 24 個まで。25 個目から後はフェード（SPEC motion §5.2・§7.1）。 */
const STAMP_LIMIT = 24;
const STAMP_STEP_MS = 30;
const FADE_AFTER_STAMPS_MS = 720;
/** インクの輪は最初の3つの「静」だけ。 */
const INK_LIMIT = 3;
/** 絞り込みで新しく出るピン: 20ms ずらし・12 個で打ち止め・インクなし。 */
const NEW_PIN_STEP_MS = 20;
const NEW_PIN_MAX_INDEX = 11;
/** 最初の idle が来なくても、load からこの時間で判子を始める。 */
const INTRO_FALLBACK_MS = 1200;
const DUR_STAMP_MS = 480;

interface PinRecord {
  marker: maplibregl.Marker;
  outer: HTMLDivElement;
  stamp: HTMLSpanElement;
  pin: MapPin;
  /** 消えている途中なら、消えるのを取り消す関数。 */
  cancelLeave: (() => void) | null;
}

function pinAriaLabel(pin: MapPin): string {
  return `${pin.label}・${quietnessLabel(pin.quietness)}`;
}

function pinTitle(pin: MapPin): string {
  return `${pin.label}（${quietnessLabel(pin.quietness)}）`;
}

/**
 * MapLibre GL JS の薄いラッパ本体。
 * ピンの選択/ホバーはコールバックで通知するのみで、実際のカードUI（カード/一覧の
 * ハイライト等）は呼び出し側（`@/components/map/CityMapScreen` 等）が
 * `@/components/ui` の共通コンポーネントで描画する。
 *
 * ピンの動き（SPEC motion §5.2.1・§7.2-5）: マーカーの外側（MapLibre が位置の transform を書く要素）には演出を付けず、
 * 内側の判子だけを動かす。判子は地図の最初の `idle`（または load から 1200ms）の後、地図が止まっている時に押し始める。
 * 演出のために `jumpTo`・`flyTo`・`fitBounds` は呼ばない。
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
  introKey,
  underlay = true,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const recordsRef = useRef<Map<string, PinRecord>>(new Map());
  const hoveredIdRef = useRef<string | null>(null);
  // フォーカスハロー: 「選択した瞬間」だけ輪を出すため、前回の選択を覚えておく。
  const haloSelectedIdRef = useRef<string | null>(null);
  // 初回の判子: "pending"（地図の準備待ち）→ "ready"（準備はできたがピンがまだ無い）→ "done"。
  const introRef = useRef<"pending" | "ready" | "done">("pending");
  const pinsRef = useRef<MapPin[]>(pins);
  const introKeyRef = useRef(introKey);

  // コールバック類は毎レンダーで新しい参照になり得るため ref 経由で最新を参照する
  // （地図・マーカーの再生成を避けるため）。ref の更新はレンダー本体ではなく
  // effect 内で行う（react-hooks/refs: レンダー中の ref 更新は禁止）。
  const callbacksRef = useRef({ onSelectPin, onHoverPin, onBackgroundClick });
  useEffect(() => {
    callbacksRef.current = { onSelectPin, onHoverPin, onBackgroundClick };
  }, [onSelectPin, onHoverPin, onBackgroundClick]);
  useEffect(() => {
    introKeyRef.current = introKey;
  }, [introKey]);

  // 初回の判子（ぽん、ぽん、ぽんと、静かな店から順に）。地図が動いている間は始めず、止まってから始める。
  const playIntroRef = useRef<() => void>(() => {});
  useEffect(() => {
    playIntroRef.current = () => {
      const map = mapRef.current;
      if (!map || introRef.current === "done") return;
      if (map.isMoving()) {
        map.once("moveend", () => playIntroRef.current());
        return;
      }
      const records = recordsRef.current;
      const order = pinsRef.current
        .map((pin) => records.get(pin.id))
        .filter((rec): rec is PinRecord => rec !== undefined && rec.cancelLeave === null);
      if (order.length === 0) {
        introRef.current = "ready";
        return;
      }
      introRef.current = "done";
      const secondVisit = hasStamped(introKeyRef.current);
      let inks = 0;
      order.forEach((rec, i) => {
        const bookmarked = rec.outer.dataset.bookmarked === "true";
        if (secondVisit) {
          playPinEntrance(rec.stamp, "fade", 0);
          if (bookmarked) setPinRibbon(rec.outer, true, "fade", 0);
          return;
        }
        if (i < STAMP_LIMIT) {
          const delay = i * STAMP_STEP_MS;
          const ink = rec.pin.quietness === "quiet" && inks < INK_LIMIT;
          if (ink) inks += 1;
          playPinEntrance(rec.stamp, "stamp", delay, ink);
          // 栞の店は、押し終わった後にリボンが挟まる
          if (bookmarked) setPinRibbon(rec.outer, true, "tuck", delay + DUR_STAMP_MS);
          return;
        }
        playPinEntrance(rec.stamp, "fade", FADE_AFTER_STAMPS_MS);
        if (bookmarked) setPinRibbon(rec.outer, true, "fade", FADE_AFTER_STAMPS_MS);
      });
      markStamped(introKeyRef.current);
    };
  });

  // 地図の初期化（マウント時に一度だけ）。
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // 動きを減らす設定なら、ピンは最初から押された状態（判子を待たない）。
    introRef.current = prefersReducedMotion() ? "done" : "pending";

    maplibregl.setWorkerUrl(MAPLIBRE_WORKER_URL);
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
      callbacksRef.current.onBackgroundClick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    });

    // 地図が出そろった（最初の idle）か、load から 1200ms の早い方で判子を始める。
    let fallbackTimer: number | undefined;
    const onReady = () => {
      window.clearTimeout(fallbackTimer);
      if (introRef.current !== "pending") return;
      introRef.current = "ready";
      playIntroRef.current();
    };
    map.once("idle", onReady);
    map.once("load", () => {
      fallbackTimer = window.setTimeout(onReady, INTRO_FALLBACK_MS);
    });

    mapRef.current = map;
    const records = recordsRef.current;

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
      window.clearTimeout(fallbackTimer);
      resizeObserver.disconnect();
      records.forEach((rec) => {
        rec.cancelLeave?.();
        rec.marker.remove();
      });
      records.clear();
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
    pinsRef.current = pins;

    const apply = () => {
      const records = recordsRef.current;
      const reduced = prefersReducedMotion();
      const introDone = introRef.current === "done";
      const nextIds = new Set(pins.map((p) => p.id));

      // 消えたピン: 外側はすぐに読み上げ・フォーカス・当たり判定から外し、内側だけが 180ms で縮んで消える。
      for (const [id, rec] of records) {
        if (nextIds.has(id) || rec.cancelLeave) continue;
        if (hoveredIdRef.current === id) {
          hoveredIdRef.current = null;
          callbacksRef.current.onHoverPin?.(null, null);
        }
        const done = () => {
          if (records.get(id) !== rec) return;
          rec.marker.remove();
          records.delete(id);
        };
        const cancel = leavePin(rec.outer, reduced, done);
        if (records.get(id) === rec) rec.cancelLeave = cancel;
      }

      let newIndex = 0;
      for (const pin of pins) {
        const selected = pin.id === selectedId;
        const bookmarked = pin.bookmarked ?? false;
        const existing = records.get(pin.id);

        if (existing) {
          if (existing.cancelLeave) {
            existing.cancelLeave();
            existing.cancelLeave = null;
          }
          const previous = existing.pin;
          existing.pin = pin;
          existing.marker.setLngLat([pin.lng, pin.lat]);
          existing.outer.dataset.selected = selected ? "true" : "false";
          if (previous.quietness !== pin.quietness || previous.label !== pin.label) {
            existing.stamp.dataset.q = pin.quietness;
            setMarkerGlyph(existing.outer, PIN_GLYPH[pin.quietness]);
            existing.outer.setAttribute("aria-label", pinAriaLabel(pin));
            existing.outer.title = pinTitle(pin);
          }
          if ((existing.outer.dataset.bookmarked === "true") !== bookmarked) {
            // 栞に挟んだ瞬間にリボンが挟まる（判子を待っている間は隠れたまま待つ）
            setPinRibbon(existing.outer, bookmarked, !introDone ? "wait" : reduced ? "none" : "tuck", 0);
          }
          if (introDone && !reduced && pin.stampKey !== undefined && pin.stampKey !== previous.stampKey) {
            playPinEntrance(existing.stamp, "stamp", 0);
          }
          continue;
        }

        const { outer, stamp } = createPinElement({
          id: pin.id,
          quietness: pin.quietness,
          ariaLabel: pinAriaLabel(pin),
          title: pinTitle(pin),
          tilt: tiltFromId(pin.id, 4),
        });
        outer.dataset.selected = selected ? "true" : "false";
        let entranceDelay = 0;
        if (!introDone) {
          stamp.classList.add("is-waiting");
        } else if (!reduced) {
          entranceDelay = Math.min(newIndex, NEW_PIN_MAX_INDEX) * NEW_PIN_STEP_MS;
          playPinEntrance(stamp, "stamp", entranceDelay);
          newIndex += 1;
        }
        if (bookmarked) {
          setPinRibbon(outer, true, !introDone ? "wait" : reduced ? "none" : "tuck", entranceDelay + DUR_STAMP_MS);
        }

        const rec: PinRecord = {
          marker: new maplibregl.Marker({ element: outer, anchor: "center" }).setLngLat([pin.lng, pin.lat]),
          outer,
          stamp,
          pin,
          cancelLeave: null,
        };

        // SPEC §9.10: D1 のホバーカードはホバー・フォーカス・タップの3つで
        // 同等に開く必要がある。マウス(mouseenter/leave)に加えて、キーボード
        // フォーカス(focus/blur)とタップ(click/keydown)でも同じ通知を出す。
        const emitHoverEnter = () => {
          if (rec.cancelLeave) return;
          hoveredIdRef.current = rec.pin.id;
          const point = map.project([rec.pin.lng, rec.pin.lat]);
          callbacksRef.current.onHoverPin?.(rec.pin.id, { x: point.x, y: point.y });
        };
        const emitHoverLeave = () => {
          if (hoveredIdRef.current === rec.pin.id) {
            hoveredIdRef.current = null;
            callbacksRef.current.onHoverPin?.(null, null);
          }
        };

        outer.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (rec.cancelLeave) return;
          emitHoverEnter();
          callbacksRef.current.onSelectPin?.(rec.pin.id);
        });
        outer.addEventListener("keydown", (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (rec.cancelLeave) return;
            emitHoverEnter();
            callbacksRef.current.onSelectPin?.(rec.pin.id);
          }
        });
        outer.addEventListener("mouseenter", emitHoverEnter);
        outer.addEventListener("mouseleave", emitHoverLeave);
        outer.addEventListener("focus", emitHoverEnter);
        outer.addEventListener("blur", emitHoverLeave);

        rec.marker.addTo(map);
        records.set(pin.id, rec);
      }

      // モーションリファレンス「フォーカスハロー」: 選択が別のピンに変わった瞬間に1回だけ輪を広げる
      // （ピンの差し替え・ホバーなど、選択が変わらない再実行では出さない）。
      if (selectedId !== haloSelectedIdRef.current) {
        haloSelectedIdRef.current = selectedId;
        const selectedRec = selectedId ? records.get(selectedId) : undefined;
        if (selectedRec) {
          spawnPinHalo(selectedRec.outer, PIN_GROUND[selectedRec.pin.quietness], reduced);
        }
      }

      // 地図の準備はできていたがピンがまだ無かった（位置の確定待ちなど）なら、そろったここで判子を押す。
      if (introRef.current === "ready") playIntroRef.current();
    };

    if (map.isStyleLoaded()) {
      apply();
      return;
    }
    map.once("load", apply);
    return () => {
      map.off("load", apply);
    };
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
      {/* 紙の地図（止まった絵）を地図の div の下に敷く: タイルが来るまでの間も地図らしく見える */}
      {underlay ? <MapUnderlay /> : null}
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} aria-label="地図" />
      {/* 出典表記（SPEC §6: 地図タイルの出典表示必須）。折りたたみ式コントロールに頼らず常時表示する。 */}
      <div
        style={{
          position: "absolute",
          right: 6,
          bottom: 4,
          zIndex: 5,
          fontSize: 10,
          fontWeight: 400,
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
