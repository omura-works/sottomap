"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { ENDORSEMENTS_REQUIRED } from "@/lib/domain/lifecycle";
import { endorseSpot } from "@/app/actions/spot-endorse";

export interface EndorseButtonProps {
  spotId: string;
  citySlug: string;
  initialCount: number;
}

/** S5 承認待ち一覧の「行ったことがある」ボタン。2人目の承認で published に遷移する。 */
export function EndorseButton({ spotId, citySlug, initialCount }: EndorseButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [done, setDone] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await endorseSpot(spotId, citySlug);
        setCount(result.endorsementCount);
        setDone(true);
        if (result.status === "published") setJustPublished(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      }
    });
  };

  return (
    <div className="space-y-1">
      <Button variant="secondary" onClick={handleClick} disabled={isPending || done}>
        {done ? "行ったことがある ✓" : "行ったことがある"}
      </Button>
      <p className="text-muted text-sm">
        承認 {count}/{ENDORSEMENTS_REQUIRED}
      </p>
      {justPublished ? <p className="text-sm">2人目の承認で地図に公開されました。</p> : null}
      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
