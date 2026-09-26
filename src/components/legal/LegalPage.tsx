import type { ReactNode } from "react";

/**
 * /terms・/privacy 共通の見た目（利用規約・プライバシーポリシー）。
 * `AppShell` が `main` を出すため、ここでは `main` を重ねない（SPEC §9系レビュー方針）。
 * 見出し構造は h1（タイトル）→ h2（各節。`LegalSection` 経由）。
 */
export interface LegalPageProps {
  title: string;
  /** 施行日など、タイトル直下に出す1行（例:「施行日: 2026年9月20日」）。 */
  effectiveDate?: string;
  lead?: ReactNode;
  children: ReactNode;
}

export function LegalPage({ title, effectiveDate, lead, children }: LegalPageProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12 space-y-8">
      <header className="space-y-2">
        <h1 className="m-0" style={{ fontSize: 30 }}>
          {title}
        </h1>
        {effectiveDate ? <p className="text-muted m-0">{effectiveDate}</p> : null}
        {lead ? <div className="text-muted space-y-2">{lead}</div> : null}
      </header>
      <div className="space-y-8">{children}</div>
    </div>
  );
}

/** 利用規約・プライバシーポリシーの各節（h2 + 本文）。 */
export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="m-0" style={{ fontSize: 22, fontWeight: 500 }}>
        {heading}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
