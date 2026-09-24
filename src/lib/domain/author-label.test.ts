// 投稿者の署名。SPEC §9.18-2（R20）: エリア・居住年数は公開しないので、署名は表示名だけ。
import { describe, expect, it } from "vitest";
import { formatAuthorLabel } from "./author-label";

describe("formatAuthorLabel", () => {
  it("署名は表示名だけ", () => {
    expect(formatAuthorLabel({ displayName: "Kさん" })).toBe("Kさん");
    expect(formatAuthorLabel({ displayName: "地元の人" })).toBe("地元の人");
  });

  it("エリア・居住年数を持つ入力（デモの利用者など）でも、署名に使わない", () => {
    const user = { displayName: "Kさん", areaName: "北24条", residentYears: 14 };
    expect(formatAuthorLabel(user)).toBe("Kさん");
  });
});
