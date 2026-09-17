import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSiteOrigin } from "./site-url";

describe("getSiteOrigin（Spec §9.13.7: メールリンクの origin は固定の環境変数から）", () => {
  beforeEach(() => {
    // 本番以外（開発・テスト）を既定にする
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NEXT_PUBLIC_SITE_URL の origin を返す（パスや末尾スラッシュは落とす）", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://urasupo.example.com/some/path/");
    expect(getSiteOrigin()).toBe("https://urasupo.example.com");
  });

  it("未設定なら例外", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
    expect(() => getSiteOrigin()).toThrow("NEXT_PUBLIC_SITE_URL");
  });

  it("URL として読めない・http(s) 以外なら例外", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "urasupo.example.com");
    expect(() => getSiteOrigin()).toThrow();
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "javascript:alert(1)");
    expect(() => getSiteOrigin()).toThrow();
  });
});

describe("getSiteOrigin（Spec §9.13.8: 本番は https 必須）", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("NODE_ENV=production では http を拒否し、https は受け付ける", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://urasupo.example.com");
    expect(() => getSiteOrigin()).toThrow("https");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    expect(() => getSiteOrigin()).toThrow("https");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://urasupo.example.com");
    expect(getSiteOrigin()).toBe("https://urasupo.example.com");
  });

  it("VERCEL_ENV=production でも http を拒否する（NODE_ENV が production でなくても）", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    expect(() => getSiteOrigin()).toThrow("https");
  });
});

describe("getSiteOrigin（本番以外の http は loopback だけ）", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "preview");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("http の localhost / 127.0.0.1 / ::1 は受け付ける", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3100/");
    expect(getSiteOrigin()).toBe("http://localhost:3100");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    expect(getSiteOrigin()).toBe("http://127.0.0.1:3000");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://[::1]:3000");
    expect(getSiteOrigin()).toBe("http://[::1]:3000");
  });

  it("http の loopback 以外は拒否する", () => {
    for (const value of ["http://urasupo.example.com", "http://192.168.0.10:3000", "http://localhost.example.com"]) {
      vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      expect(() => getSiteOrigin()).toThrow("https");
    }
  });

  it("https はプレビュー環境でも受け付ける", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://preview.urasupo.example.com");
    expect(getSiteOrigin()).toBe("https://preview.urasupo.example.com");
  });
});
