"use client";

import { LayoutGroup } from "motion/react";
import { usePathname } from "next/navigation";
import { NavTab } from "./NavTab";
import { cityContextFromPathname, getNavItems } from "./nav-items";

export interface BottomNavProps {
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
  /** ページが一度でも変わったか（AppShell が1か所で持つ。灯りが渡るときだけ弧を描く）。 */
  moved?: boolean;
}

/**
 * モバイル下部タブ（地図・さがす・栞・自分）。lg: 以上では非表示。
 * デスクトップのサイドレールと同じアイコン・選択中の丸の判子・渡る灯り（SPEC motion §4.1.1。NavTab）。
 * 高さは上の細線込みで 64px（= 4rem。地図画面の `h-[calc(100dvh-4rem)]` と AppShell の pb-16 がこの高さを
 * 前提にしている）で、各タブのタップ領域は幅1/4 × 64px。ページの切り替えの間も動かさない錨（site-tabs）。
 */
export function BottomNav({ homeCitySlug = null, moved = false }: BottomNavProps) {
  const pathname = usePathname();
  const citySlug = cityContextFromPathname(pathname, homeCitySlug);
  const navItems = getNavItems(citySlug);

  return (
    <nav
      aria-label="主要ナビゲーション"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t"
      style={{
        background: "var(--color-neutral-100)",
        borderColor: "var(--color-divider)",
        paddingBottom: "env(safe-area-inset-bottom)",
        viewTransitionName: "site-tabs",
      }}
    >
      <LayoutGroup id="tabs">
        {navItems.map((item) => (
          <NavTab key={item.key} item={item} pathname={pathname} variant="tabs" moved={moved} />
        ))}
      </LayoutGroup>
    </nav>
  );
}
