"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cityContextFromPathname, getNavItems, isNavItemActive } from "./nav-items";
import { useTabIndicator } from "./useTabIndicator";

export interface BottomNavProps {
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
}

/** モバイル下部タブ（地図・さがす・栞・自分）。lg: 以上では非表示。 */
export function BottomNav({ homeCitySlug = null }: BottomNavProps) {
  const pathname = usePathname();
  const citySlug = cityContextFromPathname(pathname, homeCitySlug);
  const navItems = getNavItems(citySlug);
  const activeKey = navItems.find((item) => isNavItemActive(item, pathname))?.key ?? null;
  // モーションリファレンス「タブインジケーター」: 選択中のタブの文字の下に線を置き、タブを移ると伸縮しながら移る。
  const { containerRef, indicatorRef, registerLabel } = useTabIndicator("x", activeKey);

  return (
    <nav
      ref={containerRef}
      aria-label="主要ナビゲーション"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t"
      style={{
        background: "var(--color-bg)",
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
            className="flex-1 flex min-h-14 flex-col items-center justify-center gap-0.5 py-2 text-[12px] tracking-[0.06em]"
            style={{
              color: active ? "var(--color-accent-700)" : "var(--color-text-muted)",
              fontWeight: active ? 500 : 400,
            }}
          >
            <span ref={registerLabel(item.key)}>{item.label}</span>
          </Link>
        );
      })}
      <span ref={indicatorRef} aria-hidden="true" data-testid="tab-indicator" className="motion-tab-indicator" style={{ opacity: 0 }} />
    </nav>
  );
}
