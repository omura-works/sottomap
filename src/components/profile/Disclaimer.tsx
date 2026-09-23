/**
 * SPEC §7「実データ方針」の注記コンポーネント。あわせて地図タイルの出典（国土地理院）も記載する（SPEC §6）。
 *
 * - デモモード（`demoMode`）: 初期データは公開情報にもとづく実在の店で、確認人数・灯りポイント・バッジ・
 *   「◯件」等の数値は架空のデータなので、その旨を書く（SPEC §7・§9.14-13）。
 * - 本番（既定）: 店は利用者の投稿で、数値も実際の記録なので「架空」とは書かない（R19 軽微）。
 *   掲載の約束は /shops と同じ「投稿者が確認した情報」にそろえる（r19-c-brief.md §3）。
 *
 * `isDemoMode()` はサーバーの環境変数を読むため、ここでは判定せず、呼び出し側（layout → AppShell →
 * SiteFooter）から渡してもらう。
 */
export function Disclaimer({ demoMode = false }: { demoMode?: boolean }) {
  if (demoMode) {
    return (
      <p className="text-muted text-xs leading-relaxed">
        掲載している店名・住所は、公開情報にもとづく実在の情報です。確認人数・灯りポイント・バッジや「◯件」といった数値は、動作確認用にUI上で示す架空のデータです。地図データ:
        国土地理院。
      </p>
    );
  }
  return (
    <p className="text-muted text-xs leading-relaxed">
      掲載している店の情報は、その街に住む投稿者が確認して投稿したものです。地図データ: 国土地理院。
    </p>
  );
}
