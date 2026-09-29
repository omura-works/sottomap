"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";
import { SiteFooter } from "./SiteFooter";
import { useHasNavigated } from "./NavTab";
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
  // ページが一度でも変わったか（ナビの灯りが渡るときだけ弧を描く。左ナビと下部タブで共有する）
  const moved = useHasNavigated(pathname);
  const hideChrome = isChromeHidden(pathname);
  const showFooter = !isFooterHidden(pathname);

  // ナビのある・なしで木の形を変えない（<main> を同じ位置に保つ）。分岐ごとに別の木を返すと、/start → 地図のように
  // 切り替わるとき <main> の中のページの包み（ViewTransition）が作り直され、出入りの演出（アイリス）が起きないため。
  return (
    <div className={hideChrome ? "flex min-h-screen flex-col" : "flex min-h-screen"}>
      {hideChrome ? null : <SideRail homeCitySlug={homeCitySlug} moved={moved} />}
      <div className={hideChrome ? "flex-1 flex flex-col min-w-0" : "flex-1 flex flex-col min-w-0 pb-16 lg:pb-0"}>
        <main className="flex-1">{children}</main>
        {showFooter ? <SiteFooter demoMode={demoMode} /> : null}
      </div>
      {hideChrome ? null : <BottomNav homeCitySlug={homeCitySlug} moved={moved} />}
    </div>
  );
}
