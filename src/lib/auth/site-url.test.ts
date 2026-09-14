import { afterEach, describe, expect, it, vi } from "vitest";
import { getSiteOrigin } from "./site-url";

describe("getSiteOrigin（Spec §9.13.7: メールリンクの origin は固定の環境変数から）", () => {
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
