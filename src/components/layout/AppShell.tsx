"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";
import { SiteFooter } from "./SiteFooter";
import { isChromeHidden, isFooterHidden } from "./nav-items";

/**
 * ルート直下のアプリシェル。/start・/verify/[requestId]・/login はナビなしの
 * フルスクリーン導線として扱う（詳細は nav-items.ts のコメント参照）。フッターは地図画面以外で出す。
 */
export interface AppShellProps {
  children: ReactNode;
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
  /** デモモードか（サーバーの layout で判定して渡す）。フッターの但し書きの出し分けに使う。 */
  demoMode?: boolean;
}

export function AppShell({ children, homeCitySlug = null, demoMode = false }: AppShellProps) {
  const pathname = usePathname();
  const hideChrome = isChromeHidden(pathname);
  const showFooter = !isFooterHidden(pathname);

  if (hideChrome) {
    return (
      <div className="flex min-h-screen flex-col">
        <main className="flex-1">{children}</main>
        {showFooter ? <SiteFooter demoMode={demoMode} /> : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <SideRail homeCitySlug={homeCitySlug} />
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0">
        <main className="flex-1">{children}</main>
        {showFooter ? <SiteFooter demoMode={demoMode} /> : null}
      </div>
      <BottomNav homeCitySlug={homeCitySlug} />
    </div>
  );
}
