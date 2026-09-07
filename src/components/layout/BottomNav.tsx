"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";

/** モバイル下部タブ（地図・さがす・栞・自分）。lg: 以上では非表示。 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="主要ナビゲーション"
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t"
      style={{
        background: "var(--color-surface)",
        borderColor: "var(--color-divider)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const active = isNavItemActive(item, pathname);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px]"
            style={{ color: active ? "var(--color-accent)" : "var(--color-text)" }}
          >
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
