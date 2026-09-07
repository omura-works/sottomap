import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New, Zen_Maru_Gothic } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className={`${zenMaruGothic.variable} ${zenKakuGothicNew.variable}`}>
      <body className="min-h-screen">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
