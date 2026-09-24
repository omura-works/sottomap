// SPEC §9.18-1: 表示名の検査（DB 関数 set_display_name と同じ規則・同じ文言）。
import { describe, expect, it } from "vitest";
import {
  ALLOWED_FORMAT_CHARACTER_RANGES,
  DEFAULT_DISPLAY_NAME,
  FORMAT_CHARACTER_RANGES,
  validateDisplayName,
} from "./display-name";

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

// R20 軽微・R21 軽微2（§9.18-1）: 双方向制御文字・不可視の書式文字（Unicode の Cf。Bidi_Control を含む）は
// 見た目を偽装できるので拒否する。ただし ZWJ（U+200D）・ZWNJ（U+200C）・タグ文字（U+E0020–U+E007F）は、
// 絵文字・地域旗・ZWNJ を使う言語の名前のために許す。
describe("validateDisplayName（見えない文字）", () => {
  const INVISIBLE = { ok: false, message: "表示名に見えない文字は使えません" };

  it.each([
    ["U+202E（右から左への上書き）", "灯り\u202Eの人"],
    ["U+202A（左から右への埋め込み）", "\u202A灯りの人"],
    ["U+2066（左から右への分離）", "灯りの人\u2066"],
    ["U+2069（分離の終わり）", "灯り\u2069の人"],
    ["U+200E（左から右への記号）", "灯り\u200Eの人"],
    ["U+200F（右から左への記号）", "灯り\u200Fの人"],
    ["U+061C（アラビア文字の記号）", "灯り\u061Cの人"],
    ["U+200B（ゼロ幅空白）", "灯り\u200Bの人"],
    ["U+2060（単語結合子）", "灯り\u2060の人"],
    ["U+00AD（ソフトハイフン）", "灯り\u00ADの人"],
    ["U+FEFF（先頭。trim で消さずに拒否する）", "\uFEFF灯りの人"],
    ["U+FEFF（末尾）", "灯りの人\uFEFF"],
    ["U+E0001（言語タグ。許すタグ文字の範囲の外）", "灯りの人\u{E0001}"],
  ])("%s は不可", (_label, name) => {
    expect(validateDisplayName(name)).toEqual(INVISIBLE);
  });

  it("見えない文字だけの名前も「空」ではなく、見えない文字として拒否する（DB と同じ）", () => {
    expect(validateDisplayName("\uFEFF")).toEqual(INVISIBLE);
  });

  it.each([
    ["ZWJ でつないだ家族の絵文字", "灯り\u{1F468}\u200D\u{1F469}\u200D\u{1F467}"],
    ["ZWJ でつないだ職業の絵文字", "\u{1F9D1}\u200D\u{1F373}の人"],
    ["タグ文字で作るイングランドの旗", "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}灯り"],
    ["ZWNJ を使う言語の名前", "می\u200Cخواهم"],
  ])("%s は使える", (_label, name) => {
    expect(validateDisplayName(name)).toEqual({ ok: true, name });
  });

  it("許す書式文字は ZWNJ・ZWJ・タグ文字（U+E0020–U+E007F）だけ", () => {
    expect(ALLOWED_FORMAT_CHARACTER_RANGES).toEqual([
      [0x200c, 0x200d],
      [0xe0020, 0xe007f],
    ]);
  });

  it("書式文字の一覧は、実行環境の Unicode の Cf と Bidi_Control をすべて含み、それ以外を含まない", () => {
    const cf = /^[\p{Cf}\p{Bidi_Control}]$/u;
    const missing: string[] = [];
    const extra: string[] = [];
    for (let cp = 0; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const ch = String.fromCodePoint(cp);
      const inList = FORMAT_CHARACTER_RANGES.some(([from, to]) => cp >= from && cp <= to);
      const isFormat = cf.test(ch);
      if (isFormat && !inList) missing.push(cp.toString(16));
      if (inList && !isFormat) extra.push(cp.toString(16));
    }
    expect(missing).toEqual([]);
    expect(extra).toEqual([]);
  });

  it("絵文字の異体字セレクタ（Cf ではない）は使える", () => {
    expect(validateDisplayName("灯り\u2764\uFE0F")).toEqual({ ok: true, name: "灯り\u2764\uFE0F" });
  });
});
