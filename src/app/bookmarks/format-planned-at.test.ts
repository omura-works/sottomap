import { afterEach, describe, expect, it, vi } from "vitest";
import { formatPlannedAtInTokyo } from "@/lib/format/date-time";

describe("formatPlannedAt", () => {
  const originalTimezone = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTimezone;
  });

  it.each(["UTC", "America/Los_Angeles"])(
    "実行環境のTZが%sでも日本時間で日付をまたげば明日と表示する",
    (timezone) => {
      process.env.TZ = timezone;
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-14T14:30:00.000Z"));

      expect(formatPlannedAtInTokyo("2026-09-14T15:30:00.000Z")).toBe("明日 0:30");
    },
  );
});
