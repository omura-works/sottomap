import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

describe("robots", () => {
  it("公開ページを許可し、ログインが要る画面・内部APIを disallow する", () => {
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    const disallow = Array.isArray(result.rules) ? result.rules[0]?.disallow : result.rules?.disallow;
    expect(disallow).toEqual(
      expect.arrayContaining([
        "/me",
        "/bookmarks",
        "/verify",
        "/api/",
        "/styleguide",
        "/login",
        "/auth/",
        "/*/spots/new",
      ]),
    );
  });

  it("sitemap と host を絶対URLで返す", () => {
    const result = robots();
    expect(result.sitemap).toMatch(/^https?:\/\/.+\/sitemap\.xml$/);
    expect(result.host).toMatch(/^https?:\/\//);
  });

  describe("公開デモ（URASUPO_PUBLIC_DEMO=1）", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("全部を disallow し、sitemap を載せない（本物と混同されないように）", () => {
      vi.stubEnv("URASUPO_PUBLIC_DEMO", "1");
      const result = robots();
      expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
      expect(result.sitemap).toBeUndefined();
    });
  });
});
