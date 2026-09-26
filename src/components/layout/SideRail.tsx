"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/LogoMark";
import { NavIcon } from "./NavIcon";
import { cityContextFromPathname, getNavItems, isNavItemActive } from "./nav-items";

export interface SideRailProps {
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
}

/**
 * デスクトップ（lg: 以上）用のナビゲーション骨格。
 * Spec D1 の2ペインは Task 3 が `/[city]` ページ内で組む「コンテンツ側の
 * サイドバー（ブランド／街見出し／チップ／店リスト）」であり、これとは別物。
 * ここは常設の細いナビレール（4タブを縦積み）。
 * 見た目は 2026-09-26 の採用案（案D）: 焦げ茶の角丸正方形のロゴ、44px の丸いアイコン枠＋下にラベル。
 * 選択中は丸い枠が淡い橙になり、アイコンが塗られる（枠の色は .nav-icon-frame の transition で切り替わる）。
 */
export function SideRail({ homeCitySlug = null }: SideRailProps) {
  const pathname = usePathname();
  const citySlug = cityContextFromPathname(pathname, homeCitySlug);
  const navItems = getNavItems(citySlug);

  return (
    <aside
      className="hidden lg:flex flex-col items-center gap-7 w-[88px] shrink-0 border-r pt-6"
      style={{ background: "var(--color-neutral-100)", borderColor: "var(--color-divider)" }}
    >
      {/* ロゴ: 焦げ茶の角丸正方形に橙の細線の地図ピン＋灯りの点。「ウラスポ」の文字は読み上げ用に残す。 */}
      <div
        className="flex h-12 w-12 items-center justify-center"
        style={{ background: "var(--color-neutral-900)", borderRadius: 14 }}
      >
        <LogoMark size={26} strokeColor="var(--color-accent-500)" dotColor="var(--color-accent-400)" />
        <span className="sr-only">ウラスポ</span>
      </div>
      {/* Codex R27 軽微1: 名前は navigation ランドマーク（nav）自体に付ける（フッターにも別の nav があるため） */}
      <nav aria-label="主要ナビゲーション" className="flex flex-col items-center gap-2.5">
        {navItems.map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-active={active ? "true" : undefined}
              className="nav-item flex min-w-16 flex-col items-center gap-1 text-[11px] leading-[1.4] tracking-[0.06em] no-underline"
              style={{
                color: active ? "var(--color-accent-700)" : "var(--color-text-muted)",
                fontWeight: 500,
              }}
            >
              <span className="nav-icon-frame h-11 w-11">
                <NavIcon name={item.key} active={active} />
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
