import { PageLamp } from "@/components/motion/PageLamp";
import { PageTransition } from "@/components/motion/PageTransition";

/**
 * SPEC §9.14-7: 動的ルートのSuspenseフォールバック（loading.tsx）で使う共通の待機表示。
 * サーバーコンポーネントとして使えるよう "use client" は付けない。
 *
 * SPEC motion §4.5「地図帳の下書き」: 見出し1本・サムネ付きの行3本の骨格を、灰色の塗りではなく点線の枠で描く。
 * - 見出しの骨格の左にページの灯り（`PageLamp`。最初から見えていて、前のページの灯りがここへ渡ってくる）。
 * - 点線の骨格と「灯りをつけています…」は 400ms 待ってから 240ms で現れる（すぐ終わる読み込みでは灯りだけが見える）。
 * - 灯りは 400ms 待ってから呼吸する（1200ms・最大4周＝5秒以内に静まる）。
 * - `prefers-reduced-motion: reduce` では呼吸もフェードもせず、止まった下書きを出す。
 * 読み上げは sr-only の `role="status"` だけに持たせ、骨格そのものは `aria-hidden`。
 *
 * 型付きの遷移の「新しい画面」はまずこの画面になるので、中身を `PageTransition` で包む（入る側のスライドをここで起こす。
 * ロード中→本物のページは型なしなので動かない。§4.2.2）。
 * 画面の高さいっぱいを取り、フッターを画面の外へ出す（読み込みの間にフッターが上に跳ねて見えないように）。
 */
export function LoadingScreen({ label = "読み込んでいます" }: { label?: string }) {
  return (
    <PageTransition>
      <div className="loading-draft loading-screen mx-auto max-w-xl px-4 py-10" aria-busy="true">
        <p role="status" className="sr-only">
          {label}
        </p>
        <div aria-hidden="true" data-testid="loading-skeleton" className="loading-draft-body">
          <div className="loading-draft-head">
            <PageLamp />
            <span className="loading-draft-line loading-draft-title" />
            <span className="loading-draft-note">灯りをつけています…</span>
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="loading-draft-row">
              <span className="loading-draft-thumb" />
              <span className="loading-draft-text">
                <span className="loading-draft-line" style={{ width: "62%" }} />
                <span className="loading-draft-line" style={{ width: "38%" }} />
              </span>
            </div>
          ))}
        </div>
      </div>
    </PageTransition>
  );
}
