"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";
import { isChromeHidden } from "./nav-items";

/**
 * ルート直下のアプリシェル。/start・/verify/[requestId] はチロムなしの
 * フルスクリーン導線として扱う（詳細は nav-items.ts のコメント参照）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideChrome = isChromeHidden(pathname);

  if (hideChrome) {
    return <main className="min-h-screen">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <SideRail />
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 pb-16 lg:pb-0">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
