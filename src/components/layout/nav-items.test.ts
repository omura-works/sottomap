import { describe, expect, it } from "vitest";
import { cityContextFromPathname, getNavItems, isNavItemActive } from "./nav-items";

describe("cityContextFromPathname（SPEC §9.14-3）", () => {
  it("街のページにいるときはその街を使う", () => {
    expect(cityContextFromPathname("/otaru", "sapporo")).toBe("otaru");
    expect(cityContextFromPathname("/otaru/search", "sapporo")).toBe("otaru");
    expect(cityContextFromPathname("/otaru/spots/abc", "sapporo")).toBe("otaru");
  });

  it("街のページ以外（栞・自分・確認）では居住街を使う", () => {
    expect(cityContextFromPathname("/bookmarks", "otaru")).toBe("otaru");
    expect(cityContextFromPathname("/me", "otaru")).toBe("otaru");
    expect(cityContextFromPathname("/verify/req-1", "otaru")).toBe("otaru");
  });

  it("居住街が未設定なら札幌", () => {
    expect(cityContextFromPathname("/bookmarks", null)).toBe("sapporo");
    expect(cityContextFromPathname("/bookmarks", undefined)).toBe("sapporo");
  });
});

describe("getNavItems", () => {
  it("地図・さがすが指定した街を指す", () => {
    const items = getNavItems("otaru");
    expect(items.find((i) => i.key === "map")?.href).toBe("/otaru");
    expect(items.find((i) => i.key === "search")?.href).toBe("/otaru/search");
    expect(items.find((i) => i.key === "bookmarks")?.href).toBe("/bookmarks");
    expect(items.find((i) => i.key === "me")?.href).toBe("/me");
  });
});

describe("isNavItemActive", () => {
  it("街トップは地図タブだけをアクティブにする", () => {
    const items = getNavItems("sapporo");
    const map = items.find((i) => i.key === "map")!;
    const search = items.find((i) => i.key === "search")!;
    expect(isNavItemActive(map, "/sapporo")).toBe(true);
    expect(isNavItemActive(search, "/sapporo")).toBe(false);
  });
});
