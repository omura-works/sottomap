import { describe, expect, it, vi } from "vitest";

describe("sitemap", () => {
  it("/start と各街の地図・検索ページを含む", async () => {
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    expect(entries.some((entry) => entry.url.endsWith("/start"))).toBe(true);
    expect(entries.some((entry) => /\/sapporo$/.test(entry.url))).toBe(true);
    expect(entries.some((entry) => /\/sapporo\/search$/.test(entry.url))).toBe(true);
  });

  it("/terms・/privacy・/faq・/shops・/contact を含む", async () => {
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    expect(entries.some((entry) => entry.url.endsWith("/terms"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/privacy"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/faq"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/shops"))).toBe(true);
    expect(entries.some((entry) => entry.url.endsWith("/contact"))).toBe(true);
  });

  it("DB取得に失敗しても /start と静的ページだけの sitemap を返し、console.errorに1行ログを出す（buildを落とさない）", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/spots", () => ({
      listCities: () => {
        throw new Error("db unreachable");
      },
    }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    expect(entries).toHaveLength(6);
    expect(entries[0].url).toMatch(/\/start$/);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0]?.join(" ")).toContain("db unreachable");

    errorSpy.mockRestore();
    vi.doUnmock("@/lib/db/spots");
    vi.resetModules();
  });
});
