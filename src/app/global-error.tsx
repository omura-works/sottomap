"use client";

// SPEC §9.14-7: ルートレイアウト自体が壊れた場合の最終防衛線。
// global-error は独自の html/body を持ち、ルートレイアウトの globals.css・フォント変数は届かない。
// 書体だけはサイトと同じ Zen Maru Gothic をここで読み込む（取れなければ system-ui で描く）。
import { Zen_Maru_Gothic } from "next/font/google";

const zenMaruGothic = Zen_Maru_Gothic({ weight: ["400", "700"], subsets: ["latin"], display: "swap" });

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          fontFamily: `${zenMaruGothic.style.fontFamily}, system-ui, sans-serif`,
          lineHeight: 1.85,
          letterSpacing: "0.025em",
          padding: "40px 20px",
        }}
      >
        <div role="alert" style={{ maxWidth: 480, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: "0.05em" }}>うまく開けませんでした</h1>
          <p>時間をおいて、もう一度お試しください。</p>
          <button type="button" onClick={() => retry()}>
            もう一度試す
          </button>
        </div>
      </body>
    </html>
  );
}
