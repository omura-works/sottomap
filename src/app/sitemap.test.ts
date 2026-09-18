import { describe, expect, it, vi } from "vitest";

describe("sitemap", () => {
  it("/start と各街の地図・検索ページを含む", async () => {
    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    expect(entries.some((entry) => entry.url.endsWith("/start"))).toBe(true);
    expect(entries.some((entry) => /\/sapporo$/.test(entry.url))).toBe(true);
    expect(entries.some((entry) => /\/sapporo\/search$/.test(entry.url))).toBe(true);
  });

  it("DB取得に失敗しても /start だけの sitemap を返す（buildを落とさない）", async () => {
    vi.resetModules();
    vi.doMock("@/lib/db/spots", () => ({
      listCities: () => {
        throw new Error("db unreachable");
      },
    }));

    const sitemap = (await import("./sitemap")).default;
    const entries = await sitemap();
    expect(entries).toHaveLength(1);
    expect(entries[0].url).toMatch(/\/start$/);

    vi.doUnmock("@/lib/db/spots");
    vi.resetModules();
  });
});
