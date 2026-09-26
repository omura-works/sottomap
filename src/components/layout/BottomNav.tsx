"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";
import { cityContextFromPathname, getNavItems, isNavItemActive } from "./nav-items";

export interface BottomNavProps {
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
}

/**
 * モバイル下部タブ（地図・さがす・栞・自分）。lg: 以上では非表示。
 * デスクトップのサイドレールと同じアイコンと選択中の丸（案D）。高さは上の細線込みで 64px（= 4rem。地図画面の
 * `h-[calc(100dvh-4rem)]` と AppShell の pb-16 がこの高さを前提にしている）で、各タブのタップ領域は幅1/4 × 64px。
 */
export function BottomNav({ homeCitySlug = null }: BottomNavProps) {
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
      }}
    >
      {navItems.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            data-active={active ? "true" : undefined}
            className="nav-item flex-1 flex h-[63px] flex-col items-center justify-center gap-0.5 text-[11px] leading-[1.4] tracking-[0.06em] no-underline"
            style={{
              color: active ? "var(--color-accent-700)" : "var(--color-text-muted)",
              fontWeight: active ? 700 : 400,
            }}
          >
            <span className="nav-icon-frame h-9 w-9">
              <NavIcon name={item.key} active={active} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
