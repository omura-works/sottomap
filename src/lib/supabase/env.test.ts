import { afterEach, describe, expect, it, vi } from "vitest";
import { EnvironmentConfigError, getSupabaseEnv, isDemoMode, isSupabaseConfigured, resolveDataMode } from "./env";

// Spec §9.13.1: デモは明示したときだけ・本番では不可・Supabase の部分設定は fail-closed。
function setEnv(values: {
  demo?: string;
  url?: string;
  anonKey?: string;
  nodeEnv?: string;
  vercelEnv?: string;
}): void {
  vi.stubEnv("URASUPO_DEMO_MODE", values.demo ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", values.url ?? "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", values.anonKey ?? "");
  vi.stubEnv("NODE_ENV", values.nodeEnv ?? "test");
  vi.stubEnv("VERCEL_ENV", values.vercelEnv ?? "");
}

describe("resolveDataMode（Spec §9.13.1）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("URASUPO_DEMO_MODE=1 を明示したときだけデモモード", () => {
    setEnv({ demo: "1" });
    expect(resolveDataMode()).toEqual({ kind: "demo" });
    expect(isDemoMode()).toBe(true);
    expect(isSupabaseConfigured()).toBe(false);
    expect(getSupabaseEnv()).toBeNull();
  });

  it("1 以外の値（true 等）はデモとみなさない", () => {
    setEnv({ demo: "true" });
    expect(() => resolveDataMode()).toThrow(EnvironmentConfigError);
  });

  it("Supabase の2つの環境変数がそろっていれば Supabase を使う", () => {
    setEnv({ url: "https://example.supabase.co", anonKey: "anon-key" });
    expect(resolveDataMode()).toEqual({
      kind: "supabase",
      env: { url: "https://example.supabase.co", anonKey: "anon-key" },
    });
    expect(isDemoMode()).toBe(false);
  });

  it("URL だけ（anon key が欠落）なら例外。デモに落ちない", () => {
    setEnv({ url: "https://example.supabase.co" });
    expect(() => resolveDataMode()).toThrow(EnvironmentConfigError);
    expect(() => isDemoMode()).toThrow("一部だけ");
  });

  it("anon key だけ（URL が欠落・変数名の誤り等）なら例外", () => {
    setEnv({ anonKey: "anon-key" });
    expect(() => resolveDataMode()).toThrow(EnvironmentConfigError);
  });

  it("デモ指定があっても Supabase の部分設定なら例外（fail-closed を優先）", () => {
    setEnv({ demo: "1", url: "https://example.supabase.co" });
    expect(() => resolveDataMode()).toThrow("一部だけ");
  });

  it("デモ未指定で Supabase も未設定なら例外（黙ってデモにしない）", () => {
    setEnv({});
    expect(() => resolveDataMode()).toThrow("URASUPO_DEMO_MODE=1");
  });

  it("NODE_ENV=production でデモが指定されていたら例外", () => {
    setEnv({ demo: "1", nodeEnv: "production" });
    expect(() => resolveDataMode()).toThrow("本番環境");
  });

  it("VERCEL_ENV=production でデモが指定されていたら例外", () => {
    setEnv({ demo: "1", vercelEnv: "production" });
    expect(() => resolveDataMode()).toThrow("本番環境");
  });

  it("本番でも Supabase の設定がそろっていれば Supabase を使う", () => {
    setEnv({ url: "https://example.supabase.co", anonKey: "anon-key", nodeEnv: "production", vercelEnv: "production" });
    expect(resolveDataMode().kind).toBe("supabase");
  });

  it("デモ指定と Supabase の完全な設定が両方あれば、明示したデモを使う（本番以外）", () => {
    setEnv({ demo: "1", url: "https://example.supabase.co", anonKey: "anon-key" });
    expect(resolveDataMode()).toEqual({ kind: "demo" });
  });
});
