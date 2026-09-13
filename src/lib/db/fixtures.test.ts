import { afterEach, describe, expect, it, vi } from "vitest";

describe("栞の予定日時フィクスチャ", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it("現在時刻に関係なく日本時間で翌日の12:30になる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T10:00:00.000Z"));
    vi.resetModules();

    const { FIXTURE_BOOKMARKS } = await import("./fixtures");
    const bookmark = FIXTURE_BOOKMARKS.find(
      (candidate) => candidate.id === "90000000-0000-4000-8000-000000000001",
    );

    expect(bookmark?.plannedAt).toBe("2026-09-15T03:30:00.000Z");
  });
});
