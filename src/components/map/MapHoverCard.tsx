// "use client" は付けない: 使う所（CityMapScreen）がすでにクライアントの部品（SPEC motion §7.2-2）。
import { memo, useImperativeHandle, useRef, useState } from "react";
import type { Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Spot } from "@/lib/db/types";
import { daysSince } from "@/lib/domain/lifecycle";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { EASE, SPRING } from "@/components/motion/tokens";
import type { MapPoint } from "./index";

export interface MapHoverCardHandle {
  /** ピンのホバー・フォーカス・タップ（id と画面上の点）。null で閉じる。 */
  update(id: string | null, point: MapPoint | null): void;
}

interface MapHoverCardProps {
  spots: readonly Spot[];
  ref?: Ref<MapHoverCardHandle>;
}

const OFFSET_X = 18;
const OFFSET_Y = -12;

/**
 * PC の地図の上のホバーカード（付箋。SPEC motion §5.2）。
 * 地図の移動・拡大のたびに位置が変わるので、位置は React の描画を通さず要素の style を直接書き換える
 * （画面全体を描き直さない。ホイールで拡大しても長いフレームを出さないため）。開く店が変わったときだけ描き直す。
 */
export const MapHoverCard = memo(function MapHoverCard({ spots, ref }: MapHoverCardProps) {
  const reduced = usePrefersReducedMotion();
  const [open, setOpen] = useState<{ id: string; point: MapPoint } | null>(null);
  const openIdRef = useRef<string | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      update(id, point) {
        if (!id || !point) {
          if (openIdRef.current !== null) {
            openIdRef.current = null;
            setOpen(null);
          }
          return;
        }
        if (id === openIdRef.current && cardRef.current) {
          cardRef.current.style.left = `${point.x + OFFSET_X}px`;
          cardRef.current.style.top = `${point.y + OFFSET_Y}px`;
          return;
        }
        openIdRef.current = id;
        setOpen({ id, point });
      },
    }),
    [],
  );

  const spot = open ? (spots.find((s) => s.id === open.id) ?? null) : null;
  const instant = { duration: 0 } as const;

  return (
    <AnimatePresence>
      {open && spot ? (
        <motion.div
          key={spot.id}
          ref={cardRef}
          className="map-hovercard"
          style={{ left: open.point.x + OFFSET_X, top: open.point.y + OFFSET_Y, transformOrigin: "left center" }}
          initial={reduced ? false : { scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0, transition: reduced ? instant : { duration: 0.12, ease: EASE.outSoft } }}
          transition={reduced ? instant : { scale: SPRING.stamp, opacity: { duration: 0.12, ease: EASE.outSoft } }}
        >
          <span className="tape map-hovercard-tape" aria-hidden="true" />
          <p className="map-hovercard-kicker">
            {`地元${spot.verifierCount}人が確認・${spot.lastVerifiedAt ? `${daysSince(spot.lastVerifiedAt, new Date())}日前` : "未確認"}`}
          </p>
          <p className="map-hovercard-name">{spot.name}</p>
          <p className="map-hovercard-desc">{spot.hoverDescription ?? spot.reason}</p>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
});
