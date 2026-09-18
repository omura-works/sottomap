import { notFound } from "next/navigation";
import { isProductionRuntime } from "@/lib/supabase/env";
import { StyleguideClient } from "./StyleguideClient";

/**
 * `/styleguide` — 本番公開前指示書 §4: 開発時のみ表示し、本番ビルドでは404にする。
 * E2E（playwright.config.ts）は `next dev`（NODE_ENV=development）で動くため、
 * 起動完了のヘルスチェックには影響しない。
 */
export default function StyleguidePage() {
  if (isProductionRuntime()) {
    notFound();
  }
  return <StyleguideClient />;
}
