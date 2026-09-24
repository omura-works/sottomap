// SPEC §9.18-1: 表示名の検査（DB 関数 set_display_name と同じ規則・同じ文言）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DISPLAY_NAME_CASES } from "./display-name.cases";
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
// 見た目を偽装できるので拒否する。ただし ZWJ（U+200D）・タグ文字（U+E0020–U+E007F）は、絵文字・地域旗のために許す
// （並びの規則は下の一覧）。ZWNJ（U+200C）は R23 重要1 で全面禁止にした。
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
  ])("%s は使える", (_label, name) => {
    expect(validateDisplayName(name)).toEqual({ ok: true, name });
  });

  it("許す書式文字は ZWJ・タグ文字（U+E0020–U+E007F）だけ（ZWNJ は許さない。R23 重要1）", () => {
    expect(ALLOWED_FORMAT_CHARACTER_RANGES).toEqual([
      [0x200d, 0x200d],
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

// R23 重要1（§9.18-1）: 表示名の並びの規則。アプリと DB（set_display_name）は同じ一覧で同じ結果になる。
//   - ZWNJ（U+200C）は全面禁止。
//   - タグ文字は、イングランド・スコットランド・ウェールズの旗の3つの並びだけ。
//   - ZWJ（U+200D）は前後が絵文字（前は肌の色の修飾子・VS16・3つの旗を遡る）のときだけ。
//   - 見える文字（Letter・Number・Punctuation・Symbol）が1つも無い名前は不可（結合文字だけの名前も不可）。
describe("validateDisplayName（アプリと DB で同じ一覧）", () => {
  it.each(DISPLAY_NAME_CASES.map((c) => [c.label, c] as const))("%s", (_label, c) => {
    const name = String.fromCodePoint(...c.codePoints);
    const expected = c.expected === "ok" ? { ok: true, name } : { ok: false, message: c.expected };
    expect(validateDisplayName(name)).toEqual(expected);
  });

  it("pgTAP（supabase/tests/0016_display_name_server_only.sql）の一覧はこの一覧と同じ", () => {
    const sql = readRepoFile("supabase/tests/0016_display_name_server_only.sql");
    const block = between(sql, "-- BEGIN display_name_cases", "-- END display_name_cases");
    const rows = Array.from(
      block.matchAll(/\(\d+, '((?:[^']|'')*)', array\[([\d, ]*)\]::integer\[\], '((?:[^']|'')*)'\)/g),
      (m) => ({
        label: (m[1] ?? "").replaceAll("''", "'"),
        codePoints: (m[2] ?? "").split(",").map((v) => Number(v.trim())),
        expected: (m[3] ?? "").replaceAll("''", "'"),
      }),
    );
    expect(rows).toEqual(DISPLAY_NAME_CASES.map((c) => ({ ...c, codePoints: [...c.codePoints] })));
  });
});

// R23 重要1: DB（0016）は Unicode の性質を正規表現で調べられないので、範囲の表を持つ。
// 表が実行環境の Unicode（アプリの判定）と一致することを確かめる。
describe("DB の文字の表（0016_display_name_server_only.sql）", () => {
  const migration = () => readRepoFile("supabase/migrations/0016_display_name_server_only.sql");

  function tableOf(name: string): Array<[number, number]> {
    const block = between(migration(), `-- BEGIN ${name}`, `-- END ${name}`);
    return Array.from(block.matchAll(/\[(\d+),(\d+)\]/g), (m) => [Number(m[1]), Number(m[2])] as [number, number]);
  }

  function rangesOf(test: (cp: number) => boolean): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let start = -1;
    for (let cp = 0; cp <= 0x110000; cp += 1) {
      const hit = cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) && test(cp);
      if (hit && start < 0) start = cp;
      if (!hit && start >= 0) {
        ranges.push([start, cp - 1]);
        start = -1;
      }
    }
    return ranges;
  }

  it("見える文字の表 = Letter・Number・Punctuation・Symbol から、ハングルの埋め字と点字の空白を除いたもの", () => {
    const visible = /^[\p{L}\p{N}\p{P}\p{S}]$/u;
    const blank = new Set([0x115f, 0x1160, 0x3164, 0xffa0, 0x2800]);
    expect(tableOf("display_name_visible_ranges")).toEqual(
      rangesOf((cp) => visible.test(String.fromCodePoint(cp)) && !blank.has(cp)),
    );
  });

  it("絵文字の表 = Extended_Pictographic", () => {
    const pictographic = /^\p{Extended_Pictographic}$/u;
    expect(tableOf("display_name_pictographic_ranges")).toEqual(
      rangesOf((cp) => pictographic.test(String.fromCodePoint(cp))),
    );
  });

  it("肌の色の修飾子（Emoji_Modifier）は U+1F3FB–U+1F3FF（DB はこの範囲で調べる）", () => {
    const modifier = /^\p{Emoji_Modifier}$/u;
    expect(rangesOf((cp) => modifier.test(String.fromCodePoint(cp)))).toEqual([[0x1f3fb, 0x1f3ff]]);
  });
});

function readRepoFile(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

function between(text: string, begin: string, end: string): string {
  const from = text.indexOf(begin);
  const to = text.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`${begin} 〜 ${end} が見つかりません`);
  return text.slice(from + begin.length, to);
}
