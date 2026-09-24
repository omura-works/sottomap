// SPEC §4 の署名「— 北24条に14年、Kさん」と §9.18-2（エリア・居住年数が無い利用者）。
import { describe, expect, it } from "vitest";
import { formatAuthorLabel } from "./author-label";

describe("formatAuthorLabel", () => {
  it("エリアと居住年数があれば「北24条に14年、Kさん」", () => {
    expect(formatAuthorLabel({ displayName: "Kさん", areaName: "北24条", residentYears: 14 })).toBe("北24条に14年、Kさん");
  });

  it("エリアか居住年数が無ければ、表示名だけ（「に?年、」のように崩さない）", () => {
    expect(formatAuthorLabel({ displayName: "地元の人", areaName: null, residentYears: null })).toBe("地元の人");
    expect(formatAuthorLabel({ displayName: "地元の人", areaName: "北24条", residentYears: null })).toBe("地元の人");
    expect(formatAuthorLabel({ displayName: "地元の人", areaName: null, residentYears: 3 })).toBe("地元の人");
    expect(formatAuthorLabel({ displayName: "地元の人", areaName: "", residentYears: 3 })).toBe("地元の人");
  });
});
