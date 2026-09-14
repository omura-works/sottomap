import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Zen_Maru_Gothic } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { isDemoMode } from "@/lib/supabase/env";
import "./globals.css";

// 見出し用フォント（Spec §5: 見出しは "Zen Maru Gothic"）。--font-heading に割り当てる。
const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["400", "700", "900"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-heading",
});

// 本文用フォント（Spec §5: 本文は "Zen Kaku Gothic New"）。--font-body に割り当てる。
const zenKakuGothicNew = Zen_Kaku_Gothic_New({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "ウラスポ",
  description: "北海道の、まだ静かな店を歩く",
};

/**
 * デモモードの帯を出すか。レイアウトは静的ページ（/styleguide 等）のビルド時にも描画されるため、
 * ここでは設定の矛盾を例外にせず「帯を出さない」だけにする。データを読む経路（src/lib/db/**・認証）は
 * 同じ判定で例外を投げるので、設定が壊れた状態でデモデータや認証なしの操作に落ちることはない。
 */
function shouldShowDemoBanner(): boolean {
  try {
    return isDemoMode();
  } catch {
    return false;
  }
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  const showDemoBanner = shouldShowDemoBanner();
  return (
    <html lang="ja" className={`${zenMaruGothic.variable} ${zenKakuGothicNew.variable}`}>
      <body className="min-h-screen">
        {showDemoBanner ? (
          <p className="m-0 px-3 py-1 text-center text-xs text-muted" style={{ background: "var(--color-surface)" }}>
            デモモード（保存されません）
          </p>
        ) : null}
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
