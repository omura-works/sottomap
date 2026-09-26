"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/LogoMark";
import { cityContextFromPathname, getNavItems, isNavItemActive } from "./nav-items";
import { useTabIndicator } from "./useTabIndicator";

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
  const activeKey = navItems.find((item) => isNavItemActive(item, pathname))?.key ?? null;
  // モーションリファレンス「タブインジケーター」: 下部タブと同じ方針で、縦に並ぶ項目の左に縦線を置く。
  const { containerRef, indicatorRef, registerLabel } = useTabIndicator("y", activeKey);

  return (
    <aside
      aria-label="主要ナビゲーション"
      className="hidden lg:flex flex-col items-stretch w-20 shrink-0 border-r"
      style={{ background: "var(--color-bg)", borderColor: "var(--color-divider)" }}
    >
      {/* ロゴ: 橙の細線の地図ピン＋「ウラスポ」（見出しの明朝）。下に hairline の区切り線。 */}
      <div
        className="mx-3 mb-3 flex flex-col items-center gap-1.5 border-b pb-4 pt-5"
        style={{ borderColor: "var(--color-divider)" }}
      >
        <LogoMark size={26} />
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 12, letterSpacing: "0.08em" }}>
          ウラスポ
        </span>
      </div>
      <nav ref={containerRef} className="relative flex flex-col gap-1 px-2">
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] py-2 text-[12px] tracking-[0.06em]"
              style={{
                color: active ? "var(--color-accent-700)" : "var(--color-text-muted)",
                background: active ? "color-mix(in srgb, var(--color-accent) 8%, transparent)" : "transparent",
                fontWeight: active ? 500 : 400,
              }}
            >
              <span ref={registerLabel(item.key)}>{item.label}</span>
            </Link>
          );
        })}
        <span
          ref={indicatorRef}
          aria-hidden="true"
          data-testid="tab-indicator"
          data-axis="y"
          className="motion-tab-indicator"
          style={{ opacity: 0 }}
        />
      </nav>
    </aside>
  );
}
