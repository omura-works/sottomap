/**
 * SPEC §9.14-7: 動的ルートのSuspenseフォールバック（loading.tsx）で使う共通の待機表示。
 * サーバーコンポーネントとして使えるよう "use client" は付けない。
 *
 * モーションリファレンス「スケルトンシマー」（1200ms・linear・無限ループ）:
 * 一覧に近い形の骨格（見出し1本・サムネ付きの行3本）を固定したまま、その上を低コントラストの
 * 光の帯が左から右へ横切る（globals.css の `.motion-skeleton`）。`prefers-reduced-motion: reduce`
 * では帯を出さず、骨格だけを静止表示する。
 * 読み上げは sr-only の `role="status"` だけに持たせ、骨格そのものは `aria-hidden`。
 */
export function LoadingScreen({ label = "読み込んでいます" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10" aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>
      <div aria-hidden="true" data-testid="loading-skeleton" className="space-y-4">
        <div className="motion-skeleton" style={{ height: 28, width: "45%", borderRadius: "var(--radius-sm)" }} />
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3">
            <div className="motion-skeleton flex-none" style={{ width: 48, height: 48, borderRadius: "var(--radius-md)" }} />
            <div className="flex-1 space-y-2">
              <div className="motion-skeleton" style={{ height: 14, width: "60%", borderRadius: "var(--radius-sm)" }} />
              <div className="motion-skeleton" style={{ height: 12, width: "40%", borderRadius: "var(--radius-sm)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
