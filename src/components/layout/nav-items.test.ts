import { describe, expect, it } from "vitest";
import { cityContextFromPathname, getNavItems, isFooterHidden, isNavItemActive, navDirection } from "./nav-items";

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

  it("街のページ（店の詳細を含む）では地図タブをアクティブにする", () => {
    const map = getNavItems("otaru").find((i) => i.key === "map")!;
    expect(isNavItemActive(map, "/otaru")).toBe(true);
    expect(isNavItemActive(map, "/otaru/spots/abc")).toBe(true);
  });

  // FAQ・規約などの単独ページを「地図」と取り違えない（aria-current="page" の誤り）。
  it("街ではないページ（/faq・/terms・/privacy・/contact・/shops）ではどのタブもアクティブにしない", () => {
    const items = getNavItems("sapporo");
    for (const path of ["/faq", "/terms", "/privacy", "/contact", "/shops", "/styleguide"]) {
      for (const item of items) {
        expect(isNavItemActive(item, path), `${item.key} @ ${path}`).toBe(false);
      }
    }
  });
});

describe("isFooterHidden（指示書 pages-c-brief.md §2）", () => {
  it("ナビなしのページ（/start・/verify・/login）でもフッターは出す（R19 軽微）", () => {
    expect(isFooterHidden("/start")).toBe(false);
    expect(isFooterHidden("/verify/req-1")).toBe(false);
    expect(isFooterHidden("/login")).toBe(false);
  });

  it("地図が画面いっぱいを占める街トップでは隠す", () => {
    expect(isFooterHidden("/sapporo")).toBe(true);
    expect(isFooterHidden("/otaru")).toBe(true);
  });

  it("街トップ以外（一覧・詳細・その他ページ）では出す", () => {
    expect(isFooterHidden("/sapporo/search")).toBe(false);
    expect(isFooterHidden("/sapporo/spots/abc")).toBe(false);
    expect(isFooterHidden("/bookmarks")).toBe(false);
    expect(isFooterHidden("/me")).toBe(false);
    expect(isFooterHidden("/shops")).toBe(false);
    expect(isFooterHidden("/contact")).toBe(false);
  });
});

describe("navDirection（SPEC motion §4.2.1）", () => {
  it("右のタブへ進むと forward、左へ戻ると back", () => {
    expect(navDirection("/sapporo", "search")).toBe("page-forward");
    expect(navDirection("/sapporo/search", "bookmarks")).toBe("page-forward");
    expect(navDirection("/bookmarks", "me")).toBe("page-forward");
    expect(navDirection("/me", "map")).toBe("page-back");
    expect(navDirection("/sapporo/search", "map")).toBe("page-back");
  });

  it("街の中の店の詳細は地図タブとして数える", () => {
    expect(navDirection("/otaru/spots/abc", "search")).toBe("page-forward");
  });

  it("今と同じタブなら型を付けない（null）", () => {
    expect(navDirection("/sapporo", "map")).toBeNull();
    expect(navDirection("/bookmarks", "bookmarks")).toBeNull();
  });

  it("タブに当たらないページ（/faq など）からは forward", () => {
    expect(navDirection("/faq", "map")).toBe("page-forward");
    expect(navDirection("/terms", "me")).toBe("page-forward");
  });
});
