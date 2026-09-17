"use client";

// SPEC §9.14-7: 予期しない例外はルートの error.tsx（React Error Boundary）で捕まえ、
// 画面が白くならないよう最小限の復帰導線を出す。
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 space-y-4" role="alert">
      <h1 style={{ fontSize: 30 }}>うまく開けませんでした</h1>
      <p className="text-muted m-0">時間をおいて、もう一度お試しください。</p>
      <button type="button" className="btn btn-primary" onClick={() => retry()}>
        もう一度試す
      </button>
    </div>
  );
}
