import type { Metadata } from "next";
import { Zen_Maru_Gothic } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { isDemoMode } from "@/lib/supabase/env";
import { getCurrentUserId } from "@/lib/auth";
import { getUserProfile, listCities } from "@/lib/db/spots";
import { getSiteOrigin } from "@/lib/auth/site-url";
import "./globals.css";

/**
 * metadataBase・OGP用の絶対URLの元になる origin。
 * `NEXT_PUBLIC_SITE_URL` 未設定・不正のときは例外を投げる関数（本番は必須・SPEC §9.13.8）だが、
 * metadata はビルド時にも評価されるため、ここでは例外にせず undefined にする
 * （実行系の判定は src/lib/supabase/env.ts・src/lib/auth/site-url.ts が別途担う）。
 */
function resolveSiteOrigin(): string | undefined {
  try {
    return getSiteOrigin();
  } catch {
    return undefined;
  }
}

const siteOrigin = resolveSiteOrigin();

// サイトの書体（Spec §5: "Zen Maru Gothic" 1書体。2026-09-26 に Zen Old Mincho＋Zen Kaku Gothic New から統一）。
// 階層は太さ（300/400/500/700）と字間で作る。Spec の変数名を保つため、--font-heading と --font-body の
// 両方をこの書体に向ける（next/font の variable は1つなので、もう片方は globals.css の :root で同じ値を指す）。
const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["300", "400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zen-maru-gothic",
});

export const metadata: Metadata = {
  ...(siteOrigin ? { metadataBase: new URL(siteOrigin) } : {}),
  title: {
    default: "そっとマップ",
    template: "%s｜そっとマップ",
  },
  description:
    "住んでいる人が残した店だけを見せる、北海道の街の地図。まだ静かな店を、地元の確認だけで歩く。",
  openGraph: {
    title: "そっとマップ",
    description: "北海道の、まだ静かな店を歩く",
    siteName: "そっとマップ",
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "そっとマップ",
    description: "北海道の、まだ静かな店を歩く",
  },
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

/**
 * SPEC §9.14-3: 「地図」「さがす」の既定行き先に使う利用者の居住街slug。
 * 未ログイン・居住街未設定・データ取得失敗（設定不整合等）のいずれでも null にし、
 * nav-items.ts 側の既定（札幌）へ委ねる（レイアウトはこの判定で例外を投げない）。
 */
async function resolveHomeCitySlug(): Promise<string | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const profile = await getUserProfile(userId);
    if (!profile?.homeCityId) return null;
    const cities = await listCities();
    return cities.find((city) => city.id === profile.homeCityId)?.slug ?? null;
  } catch {
    return null;
  }
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const showDemoBanner = shouldShowDemoBanner();
  const homeCitySlug = await resolveHomeCitySlug();
  return (
    <html lang="ja" className={zenMaruGothic.variable}>
      <body className="min-h-screen">
        {showDemoBanner ? (
          <p className="m-0 px-3 py-1 text-center text-xs text-muted" style={{ background: "var(--color-surface)" }}>
            デモモード（保存されません）
          </p>
        ) : null}
        <AppShell homeCitySlug={homeCitySlug} demoMode={showDemoBanner}>{children}</AppShell>
      </body>
    </html>
  );
}
