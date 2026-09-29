import type { Metadata } from "next";
import { Mochiy_Pop_One, Zen_Maru_Gothic } from "next/font/google";
import { AppShell } from "@/components/layout/AppShell";
import { MotionRoot } from "@/components/motion/MotionRoot";
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

// サイトの書体は2つ（SPEC motion §2.1「灯りの地図帳」。docs/SPEC.md §9.9 に優先する）。
// - 本文・ボタン・h3 以下: Zen Maru Gothic（400/500/700。300 は使わなくなった）。
// - 見出し h1・h2・大きな数字・判子の字・ワードマーク: Mochiy Pop One（400 のみ）。
//   preload しない・swap: 読み込まれるまでは Zen Maru Gothic で描かれ、最初の表示（LCP）を待たせない。
// globals.css の --font-heading / --font-body がこの2つの variable を指す。
const zenMaruGothic = Zen_Maru_Gothic({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zen-maru-gothic",
});
const mochiyPopOne = Mochiy_Pop_One({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  preload: false,
  variable: "--font-mochiy",
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
    <html lang="ja" className={`${zenMaruGothic.variable} ${mochiyPopOne.variable}`}>
      <body className="min-h-screen">
        {showDemoBanner ? (
          <p data-demo-banner="" className="m-0 px-3 py-1 text-center text-xs text-muted" style={{ background: "var(--color-surface)" }}>
            デモモード（保存されません）
          </p>
        ) : null}
        {/* 灯りの層と motion の設定は AppShell の外に置く（ナビあり・なしの分岐が切り替わっても作り直さない。SPEC motion §4.1.4） */}
        <MotionRoot>
          <AppShell homeCitySlug={homeCitySlug} demoMode={showDemoBanner}>{children}</AppShell>
        </MotionRoot>
      </body>
    </html>
  );
}
