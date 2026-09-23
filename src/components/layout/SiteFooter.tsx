import Link from "next/link";
import { Disclaimer } from "@/components/profile/Disclaimer";

interface FooterLink {
  label: string;
  href: string;
}

const FOOTER_LINKS: readonly FooterLink[] = [
  { label: "利用規約", href: "/terms" },
  { label: "プライバシーポリシー", href: "/privacy" },
  { label: "よくある質問", href: "/faq" },
  { label: "お問い合わせ", href: "/contact" },
  { label: "掲載店舗の方へ", href: "/shops" },
];

/**
 * 全ページ共通フッター。サイト名 → リンク → 但し書き（Disclaimer）の順。
 * 見本（genchikit.com）の並びに合わせる（指示書 pages-c-brief.md §2）。
 * `AppShell` 側で S2「地図」/ D1「PC版トップ」など地図が画面いっぱいを占めるページでは
 * 出さない（`isFooterHidden` 参照）。
 * `demoMode` はサーバーの layout で `isDemoMode()` を判定して渡す（但し書きの「架空のデータ」はデモのときだけ）。
 */
export function SiteFooter({ demoMode = false }: { demoMode?: boolean }) {
  return (
    <footer
      className="border-t px-4 py-6 space-y-4"
      style={{ borderColor: "var(--color-divider)" }}
    >
      <p className="m-0 text-sm" style={{ fontFamily: "var(--font-heading)", fontWeight: 700 }}>
        ウラスポ
      </p>
      <nav aria-label="フッターリンク">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 m-0 p-0 list-none">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex items-center text-sm underline"
                style={{ minHeight: 44, textUnderlineOffset: "3px" }}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Disclaimer demoMode={demoMode} />
    </footer>
  );
}
