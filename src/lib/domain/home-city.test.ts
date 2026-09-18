import { describe, expect, it } from "vitest";
import {
  canChangeHomeCity,
  formatHomeCityChangeDate,
  homeCityConfirmMessage,
  homeCityLimitMessage,
  nextHomeCityChangeAt,
} from "./home-city";

describe("住んでいる街の変更規則（SPEC §9.16）", () => {
  it("未変更（null）ならいつでも変えられる", () => {
    expect(nextHomeCityChangeAt(null)).toBeNull();
    expect(canChangeHomeCity(null)).toBe(true);
  });

  it("変えてから90日未満は変えられず、ちょうど90日から変えられる", () => {
    const changedAt = "2026-09-18T01:00:00.000Z";
    expect(canChangeHomeCity(changedAt, new Date("2026-12-17T00:59:59.999Z"))).toBe(false);
    expect(canChangeHomeCity(changedAt, new Date("2026-12-17T01:00:00.000Z"))).toBe(true);
  });

  it("次に変えられる日は東京の日付で、時刻の端数は翌日へ切り上げる", () => {
    // 東京 2026-12-17 00:00 ちょうど
    expect(formatHomeCityChangeDate(new Date("2026-12-16T15:00:00.000Z"))).toBe("2026年12月17日");
    // 東京 2026-12-17 00:00:01
    expect(formatHomeCityChangeDate(new Date("2026-12-16T15:00:01.000Z"))).toBe("2026年12月18日");
    // 東京 2026-12-31 23:30 → 年をまたいで切り上げ
    expect(formatHomeCityChangeDate(new Date("2026-12-31T14:30:00.000Z"))).toBe("2027年1月1日");
  });

  it("拒否と確認の文言", () => {
    expect(homeCityLimitMessage(new Date("2026-12-16T15:00:00.000Z"))).toBe(
      "住んでいる街は90日に1回まで変えられます。次に変えられるのは2026年12月17日以降です。",
    );
    expect(homeCityConfirmMessage("小樽", new Date("2026-09-17T15:00:00.000Z"))).toBe(
      "住んでいる街を小樽に変えますか。次に変えられるのは2026年12月17日以降です。",
    );
  });
});
