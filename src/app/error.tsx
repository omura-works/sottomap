"use client";

import { useState } from "react";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";
import { Lantern } from "@/components/illustrations/Lantern";

// SPEC §9.14-7: 予期しない例外はルートの error.tsx（React Error Boundary）で捕まえ、
// 画面が白くならないよう最小限の復帰導線を出す。
// SPEC motion §5.15: 上に提灯。表示したとき光が一度だけ「ふっ」と弱まって戻り（点滅ではない）、
// 「もう一度試す」を押すと光が満ちる（同時に retry() を呼ぶ。光を待たない）。
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const [retrying, setRetrying] = useState(false);
  return (
    <PageTransition>
      <div className="error-screen mx-auto max-w-xl px-4 py-10 space-y-4" role="alert">
        <Lantern size={72} lit tone="paper" className={retrying ? "error-lantern is-full" : "error-lantern"} />
        <h1 className="error-title">
          <PageLamp />
          うまく開けませんでした
        </h1>
        <p className="text-muted m-0">少し時間をおいて、もう一度ためしてみてください。</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setRetrying(true);
            retry();
          }}
        >
          もう一度試す
        </button>
      </div>
    </PageTransition>
  );
}
