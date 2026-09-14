// 実行モードの判定（Spec §9.13.1）。
//
// - デモモード（インメモリのフィクスチャ＋固定のデモユーザー）は `URASUPO_DEMO_MODE=1` を**明示**したときだけ。
//   本番（VERCEL_ENV=production または NODE_ENV=production）で指定されていたら例外を投げる。
//   `next build` / `next start` は NODE_ENV=production で動くため、デモモードは `next dev` とテストでだけ使える。
// - Supabase の環境変数が一部だけ（URL か anon key の片方）なら例外（fail-closed）。
// - デモ未指定で Supabase も未設定なら例外。「足りないからデモに落ちる」挙動は持たない。
//
// ここで投げる例外は設定の誤りなので、握りつぶさずにそのまま 500 として表に出す。

export class EnvironmentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvironmentConfigError";
  }
}

export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

export type DataMode = { kind: "demo" } | { kind: "supabase"; env: SupabasePublicEnv };

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** 本番とみなす実行環境か（Spec §9.13.1）。 */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
}

/** 現在の実行モードを返す。設定に矛盾があれば EnvironmentConfigError を投げる。 */
export function resolveDataMode(): DataMode {
  const url = nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const demoRequested = process.env.URASUPO_DEMO_MODE === "1";

  if (demoRequested && isProductionRuntime()) {
    throw new EnvironmentConfigError(
      "本番環境（VERCEL_ENV=production または NODE_ENV=production）ではデモモード（URASUPO_DEMO_MODE=1）を有効にできません。",
    );
  }
  if ((url === null) !== (anonKey === null)) {
    throw new EnvironmentConfigError(
      "Supabase の環境変数が一部だけ設定されています。NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY は両方必要です。",
    );
  }
  if (demoRequested) return { kind: "demo" };
  if (url !== null && anonKey !== null) return { kind: "supabase", env: { url, anonKey } };
  throw new EnvironmentConfigError(
    "Supabase の環境変数（NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY）が未設定です。" +
      "開発時にフィクスチャで動かす場合は URASUPO_DEMO_MODE=1 を指定してください。",
  );
}

/** デモモードか。設定に矛盾があれば例外。 */
export function isDemoMode(): boolean {
  return resolveDataMode().kind === "demo";
}

/**
 * Supabase を使うか（= デモモードではない）。設定に矛盾があれば例外。
 * src/lib/db/** はこれが false のときだけフィクスチャを使う。
 */
export function isSupabaseConfigured(): boolean {
  return !isDemoMode();
}

/** Supabase の接続情報。デモモードでは null。設定に矛盾があれば例外。 */
export function getSupabaseEnv(): SupabasePublicEnv | null {
  const mode = resolveDataMode();
  return mode.kind === "supabase" ? mode.env : null;
}
