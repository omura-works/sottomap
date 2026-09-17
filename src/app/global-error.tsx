"use client";

// SPEC §9.14-7: ルートレイアウト自体が壊れた場合の最終防衛線。
// global-error は独自の html/body を持つ必要がある（next/font 等のグローバルは使えない）。
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", padding: "40px 20px" }}>
        <div role="alert" style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24 }}>うまく開けませんでした</h1>
          <p>時間をおいて、もう一度お試しください。</p>
          <button type="button" onClick={() => retry()}>
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  );
}
