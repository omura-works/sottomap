import { describe, expect, it } from "vitest";
import { newSpotSchema } from "./schema";

const BASE = {
  cityId: "city-1",
  name: "店の名前",
  reason: "理由",
  visitFrequency: "monthly",
};

describe("newSpotSchema（緯度・経度）", () => {
  // SPEC §9.14-14: 空文字は「未選択」を表し、`z.coerce.number()` が 0 として通してしまわないこと。
  it("緯度・経度が空文字なら必須エラーになる（0として通さない）", () => {
    const result = newSpotSchema.safeParse({ ...BASE, lat: "", lng: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const latIssue = result.error.issues.find((i) => i.path[0] === "lat");
      const lngIssue = result.error.issues.find((i) => i.path[0] === "lng");
      expect(latIssue?.message).toBe("地図で位置を選ぶか、緯度・経度を入力してください");
      expect(lngIssue?.message).toBe("地図で位置を選ぶか、緯度・経度を入力してください");
    }
  });

  it("緯度91（範囲外）は範囲エラーになる", () => {
    const result = newSpotSchema.safeParse({ ...BASE, lat: "91", lng: "141" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const latIssue = result.error.issues.find((i) => i.path[0] === "lat");
      expect(latIssue?.message).toBe("緯度は-90から90の範囲で入力してください");
    }
  });

  it("緯度-91（範囲外）は範囲エラーになる", () => {
    const result = newSpotSchema.safeParse({ ...BASE, lat: "-91", lng: "141" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const latIssue = result.error.issues.find((i) => i.path[0] === "lat");
      expect(latIssue?.message).toBe("緯度は-90から90の範囲で入力してください");
    }
  });

  it("経度181（範囲外）は範囲エラーになる", () => {
    const result = newSpotSchema.safeParse({ ...BASE, lat: "43", lng: "181" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const lngIssue = result.error.issues.find((i) => i.path[0] === "lng");
      expect(lngIssue?.message).toBe("経度は-180から180の範囲で入力してください");
    }
  });

  it("経度-181（範囲外）は範囲エラーになる", () => {
    const result = newSpotSchema.safeParse({ ...BASE, lat: "43", lng: "-181" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const lngIssue = result.error.issues.find((i) => i.path[0] === "lng");
      expect(lngIssue?.message).toBe("経度は-180から180の範囲で入力してください");
    }
  });

  it("範囲内の緯度経度は成功する", () => {
    const result = newSpotSchema.safeParse({ ...BASE, lat: "43.0621", lng: "141.3544" });
    expect(result.success).toBe(true);
  });
});
