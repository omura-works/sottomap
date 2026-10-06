"use client";

import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/LogoMark";
import { NavTab } from "./NavTab";
import { cityContextFromPathname, getNavItems } from "./nav-items";

export interface SideRailProps {
  /** 利用者の居住街slug（未ログイン・未設定なら null）。SPEC §9.14-3。 */
  homeCitySlug?: string | null;
  /** ページが一度でも変わったか（AppShell が1か所で持つ。灯りが渡るときだけ弧を描く）。 */
  moved?: boolean;
}

/**
 * デスクトップ（lg: 以上）用のナビゲーション骨格。
 * Spec D1 の2ペインは Task 3 が `/[city]` ページ内で組む「コンテンツ側の
 * サイドバー（ブランド／街見出し／チップ／店リスト）」であり、これとは別物。
 * ここは常設の細いナビレール（4タブを縦積み）。
 * 見た目は 2026-09-26 の採用案（案D）: 焦げ茶の角丸正方形のロゴ、44px の丸いアイコン枠＋下にラベル。
 * 選択中の丸は判子のように押され、右上の灯りがタブからタブへ渡る（SPEC motion §4.1.1。NavTab）。
 * ページの切り替えの間も動かさない錨（view-transition-name: site-rail）。
 */
export function SideRail({ homeCitySlug = null, moved = false }: SideRailProps) {
  const pathname = usePathname();
  const citySlug = cityContextFromPathname(pathname, homeCitySlug);
  const navItems = getNavItems(citySlug);

  return (
    <aside
      className="hidden lg:flex flex-col items-center gap-7 w-[88px] shrink-0 border-r pt-6"
      style={{ background: "var(--color-neutral-100)", borderColor: "var(--color-divider)", viewTransitionName: "site-rail" }}
    >
      {/* ロゴ: 焦げ茶の角丸正方形に橙の細線の地図ピン＋灯りの点。「そっとマップ」の文字は読み上げ用に残す。 */}
      <div
        className="flex h-12 w-12 items-center justify-center"
        style={{ background: "var(--color-neutral-900)", borderRadius: 14 }}
      >
        <LogoMark size={26} strokeColor="var(--color-accent-500)" dotColor="var(--color-accent-400)" />
        <span className="sr-only">そっとマップ</span>
      </div>
      {/* Codex R27 軽微1: 名前は navigation ランドマーク（nav）自体に付ける（フッターにも別の nav があるため） */}
      <nav aria-label="主要ナビゲーション" className="flex flex-col items-center gap-2.5">
        {/* 灯りは左ナビと下部タブで別々に位置を覚える（NavTab の variant）ので、2つの間を飛ばない */}
        {navItems.map((item) => (
          <NavTab key={item.key} item={item} pathname={pathname} variant="rail" moved={moved} />
        ))}
      </nav>
    </aside>
  );
}
