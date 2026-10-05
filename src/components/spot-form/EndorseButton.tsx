"use client";

import { useState, useTransition } from "react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui";
import { endorseSpot } from "@/app/actions/spot-endorse";
import { HandLine } from "@/components/illustrations/HandLine";
import { Lantern } from "@/components/illustrations/Lantern";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { EndorseMeter } from "./EndorseMeter";

export interface EndorseButtonProps {
  spotId: string;
  citySlug: string;
  initialCount: number;
}

/**
 * S5 承認待ち一覧の「行ったことがある」ボタン。2人目の承認で published に遷移する（SPEC motion §5.8）。
 * 押すと増えた枠に ✓ の判子が押され、2人目で公開されたらカードの右上に花丸が描かれて文が跳ねる。
 * 押した後も disabled にはせず aria-disabled（フォーカスを失わせない）。
 */
export function EndorseButton({ spotId, citySlug, initialCount }: EndorseButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [done, setDone] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const reduced = usePrefersReducedMotion();
  const unavailable = isPending || done;

  const handleClick = () => {
    if (unavailable) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await endorseSpot(spotId, citySlug);
        setCount(result.endorsementCount);
        setDone(true);
        if (result.status === "published") setJustPublished(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "ごめんなさい、うまくいきませんでした。もう一度押してみてください。");
      }
    });
  };

  return (
    <div className="endorse">
      <Button variant="secondary" onClick={handleClick} aria-disabled={unavailable ? "true" : undefined}>
        {done ? "行ったことがある ✓" : "行ったことがある"}
      </Button>
      <EndorseMeter count={count} pressIndex={done ? count - 1 : undefined} />
      {justPublished ? (
        <>
          {/* 花丸はカード（position: relative）の右上に描かれる */}
          <HandLine variant="hanamaru" draw={!reduced} delay={200} className="endorse-hanamaru" />
          <p className="endorse-published verb-pop" style={{ "--d": "200ms" } as CSSProperties}>
            2人目の「行ったことがある」で、地図に出ました！
          </p>
        </>
      ) : null}
      {error ? (
        <p role="alert" className="inline-alert alert-in text-sm">
          <Lantern size={16} tone="paper" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
