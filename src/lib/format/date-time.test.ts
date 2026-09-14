import { afterEach, describe, expect, it } from "vitest";
import {
  calendarDaysBetweenInTokyo,
  formatTokyoMonthDay,
  formatTokyoYearMonth,
  nextDayAtTokyoTime,
} from "./date-time";

describe("日本時間の日付整形", () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTimezone;
  });

  it.each(["UTC", "America/Los_Angeles"])("実行環境のTZが%sでも日本時間の年月を返す", (timezone) => {
    process.env.TZ = timezone;
    expect(formatTokyoYearMonth("2025-11-30T15:30:00.000Z")).toBe("2025年12月");
  });

  it("日本時間の月日を返す（UTC では前日でも日本時間の日付）", () => {
    expect(formatTokyoMonthDay("2026-12-12T15:30:00.000Z")).toBe("12月13日");
    expect(formatTokyoMonthDay("2026-12-12T14:59:59.000Z")).toBe("12月12日");
  });

  it("日本時間の暦日差を返す", () => {
    expect(
      calendarDaysBetweenInTokyo(
        "2026-09-14T14:30:00.000Z",
        new Date("2026-09-14T15:30:00.000Z"),
      ),
    ).toBe(1);
  });

  it("日本時間で翌日の12:30を作る", () => {
    expect(nextDayAtTokyoTime(new Date("2026-09-14T10:00:00.000Z"), 12, 30).toISOString()).toBe(
      "2026-09-15T03:30:00.000Z",
    );
  });
});
