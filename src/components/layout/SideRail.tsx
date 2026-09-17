"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cityContextFromPathname, getNavItems, isNavItemActive } from "./nav-items";

export interface SideRailProps {
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
}

/**
 * デスクトップ（lg: 以上）用のナビゲーション骨格。
 * Spec D1 の2ペインは Task 3 が `/[city]` ページ内で組む「コンテンツ側の
 * サイドバー（ブランド／街見出し／チップ／店リスト）」であり、これとは別物。
 * ここは常設の細いナビレール（4タブを縦積み）で、中身は空でよい旨のとおり
 * 最小限の骨格のみを持つ。
 */
export function SideRail({ homeCitySlug = null }: SideRailProps) {
  const pathname = usePathname();
  const citySlug = cityContextFromPathname(pathname, homeCitySlug);
  const navItems = getNavItems(citySlug);

  return (
    <aside
      aria-label="主要ナビゲーション"
      className="hidden lg:flex flex-col items-stretch w-20 shrink-0 border-r"
      style={{ background: "var(--color-surface)", borderColor: "var(--color-divider)" }}
    >
      <div className="px-2 py-4 text-center" style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 13 }}>
        ウラスポ
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-col items-center gap-1 rounded-md py-2 text-[11px]"
              style={{
                color: active ? "var(--color-accent-700)" : "var(--color-text)",
                background: active ? "var(--color-accent-100)" : "transparent",
              }}
            >
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
