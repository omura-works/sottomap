import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

const ORIGIN = "https://urasupo.example";
const BACKSLASH = String.fromCharCode(92);

describe("safeNextPath", () => {
  it("同一originのアプリ内パスを許可する", () => {
    expect(safeNextPath("/sapporo", ORIGIN)).toBe("/sapporo");
  });

  it.each([
    ["プロトコル相対URL", "//evil.com"],
    ["バックスラッシュ1文字を含むURL", `/${BACKSLASH}evil.com`],
    ["バックスラッシュ2文字を含むURL", `/${BACKSLASH}${BACKSLASH}evil.com`],
    ["絶対URL", "https://evil.com"],
    ["javascript URL", "javascript:alert(1)"],
    ["空文字", ""],
    ["null", null],
  ])("%sは開始画面へフォールバックする", (_label, value) => {
    expect(safeNextPath(value, ORIGIN)).toBe("/start");
  });
});
