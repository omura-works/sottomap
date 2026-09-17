/**
 * SPEC §9.14-7: 動的ルートのSuspenseフォールバック（loading.tsx）で使う共通の待機表示。
 * サーバーコンポーネントとして使えるよう "use client" は付けない。
 */
export function LoadingScreen({ label = "読み込み中…" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-10" aria-busy="true" aria-live="polite">
      <p className="text-muted m-0">{label}</p>
    </div>
  );
}
