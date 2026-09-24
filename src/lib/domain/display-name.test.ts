// SPEC §9.18-1: 表示名の検査（DB 関数 set_display_name と同じ規則・同じ文言）。
import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY_NAME, validateDisplayName } from "./display-name";

describe("validateDisplayName", () => {
  it("初期値は「地元の人」", () => {
    expect(DEFAULT_DISPLAY_NAME).toBe("地元の人");
  });

  it("前後の空白（全角を含む）を除いて返す", () => {
    expect(validateDisplayName("　 灯りの人 ")).toEqual({ ok: true, name: "灯りの人" });
  });

  it("空白だけは不可", () => {
    expect(validateDisplayName(" 　")).toEqual({ ok: false, message: "表示名を入力してください" });
  });

  it("20文字までは可、21文字は不可（絵文字などは1文字として数える）", () => {
    expect(validateDisplayName("あ".repeat(20))).toEqual({ ok: true, name: "あ".repeat(20) });
    expect(validateDisplayName("🏮".repeat(20))).toEqual({ ok: true, name: "🏮".repeat(20) });
    expect(validateDisplayName("あ".repeat(21))).toEqual({ ok: false, message: "表示名は20文字以内で入力してください" });
  });

  it("改行・制御文字は不可", () => {
    expect(validateDisplayName("灯り\nの人")).toEqual({ ok: false, message: "表示名に改行や制御文字は使えません" });
    expect(validateDisplayName("灯り\tの人")).toEqual({ ok: false, message: "表示名に改行や制御文字は使えません" });
  });

  it("メールアドレスの形は不可（全角の＠も）", () => {
    expect(validateDisplayName("foo@example.com")).toEqual({ ok: false, message: "表示名にメールアドレスは使えません" });
    expect(validateDisplayName("foo＠example")).toEqual({ ok: false, message: "表示名にメールアドレスは使えません" });
  });

  it("@ を含んでも、前後に文字が無ければメールアドレスの形ではない", () => {
    expect(validateDisplayName("@灯り")).toEqual({ ok: true, name: "@灯り" });
  });
});
