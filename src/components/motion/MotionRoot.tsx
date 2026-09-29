"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { usePathname } from "next/navigation";
import { LampLayer, LampProvider } from "./LampLayer";

/**
 * 動きの土台（SPEC motion §4.1.4）。`layout.tsx` の `<body>` の中で `AppShell` を包む
 * （AppShell の中の分岐に置くと、/start → /[city] で灯りの層が作り直されるため）。
 * - motion は OS の「視差効果を減らす」に従う（`reducedMotion="user"`）。
 * - 画面の一番上に灯りの層を1枚だけ置き、`useLamp()` で飛ばせるようにする。
 * - チップの塗りが「押した位置から」広がるよう、押した位置を `--px`/`--py` に書く（§2.9）。
 */
export function MotionRoot({ children }: { children: ReactNode }) {
  useChipPressOrigin();
  usePageLampGuard();
  return (
    <MotionConfig reducedMotion="user">
      <LampProvider>
        {children}
        <LampLayer />
      </LampProvider>
    </MotionConfig>
  );
}

const CHIP_HIT_SELECTOR = ".chip-hit, .start-city-chip";

/**
 * チップ（`.chip`）の塗りの円の中心。ポインタで押したらその位置、キーボードなら中心（§2.9）。
 * 1か所の委譲で全チップに効かせ、チップごとの JS を持たない。
 */
function useChipPressOrigin() {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const hit = event.target instanceof Element ? event.target.closest(CHIP_HIT_SELECTOR) : null;
      const chip = hit?.querySelector<HTMLElement>(".chip");
      if (!chip) return;
      const r = chip.getBoundingClientRect();
      chip.style.setProperty("--px", `${Math.round(event.clientX - r.left)}px`);
      chip.style.setProperty("--py", `${Math.round(event.clientY - r.top)}px`);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const hit = event.target instanceof Element ? event.target.closest(CHIP_HIT_SELECTOR) : null;
      const chip = hit?.querySelector<HTMLElement>(".chip");
      if (!chip) return;
      chip.style.setProperty("--px", "50%");
      chip.style.setProperty("--py", "50%");
    };
    document.addEventListener("pointerdown", onPointerDown, { capture: true, passive: true });
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, []);
}

/**
 * 開発中だけ: ページが変わるたびに、見えている `.page-lamp` が2つ以上あれば知らせる
 * （同じ `page-lamp` の名前が2つ描かれると、その遷移の演出がまるごと止まるため。§4.1.2）。本番では何もしない。
 */
function usePageLampGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof requestAnimationFrame !== "function") return;
    const frame = requestAnimationFrame(() => {
      const visible = Array.from(document.querySelectorAll(".page-lamp")).filter((el) => el.getClientRects().length > 0);
      if (visible.length > 1) {
        console.warn(`[motion] ${pathname} で見えている .page-lamp が ${visible.length} 個あります。1ページに1つだけ置いてください。`);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);
}
