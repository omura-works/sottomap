import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./authorize";

describe("isAuthorizedCronRequest（CRON_SECRET の定数時間比較）", () => {
  it("Bearer と秘密が一致すれば許可", () => {
    expect(isAuthorizedCronRequest("Bearer s3cret-value", "s3cret-value")).toBe(true);
  });
  it("秘密が違えば拒否（長さが違っても例外にならない）", () => {
    expect(isAuthorizedCronRequest("Bearer wrong", "s3cret-value")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer s3cret-value-and-more", "s3cret-value")).toBe(false);
  });
  it("Bearer が無い・ヘッダーが無いなら拒否", () => {
    expect(isAuthorizedCronRequest("s3cret-value", "s3cret-value")).toBe(false);
    expect(isAuthorizedCronRequest(null, "s3cret-value")).toBe(false);
  });
  it("CRON_SECRET が未設定・空なら常に拒否（空ヘッダーとの一致も許さない）", () => {
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
    expect(isAuthorizedCronRequest("Bearer undefined", undefined)).toBe(false);
  });
});
