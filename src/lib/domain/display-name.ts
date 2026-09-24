// SPEC §9.18-1: 表示名の規則。DB 関数 set_display_name（0011・0012・0014）と同じ規則・同じ文言にそろえる。
// Server Action は通信の前にここで弾き、デモモード（フィクスチャ）もこの規則で保存する。

/** ログイン時に作るプロフィールの表示名（メールアドレスの一部は使わない）。 */
export const DEFAULT_DISPLAY_NAME = "地元の人";

export const DISPLAY_NAME_MAX_LENGTH = 20;

export const DISPLAY_NAME_MESSAGES = {
  empty: "表示名を入力してください",
  tooLong: `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください`,
  control: "表示名に改行や制御文字は使えません",
  invisible: "表示名に見えない文字は使えません",
  email: "表示名にメールアドレスは使えません",
} as const;

export type DisplayNameValidation = { ok: true; name: string } | { ok: false; message: string };

/**
 * 見えない書式文字（Unicode の一般カテゴリ Cf。双方向制御文字 Bidi_Control はすべてここに含まれる）の範囲。
 * R20 軽微（§9.18-1）: 右から左への上書き・ゼロ幅文字などで、署名の見た目を偽装できないようにする。
 * DB 関数 public.contains_format_character（0012）と同じ一覧。Unicode 17.0 の Cf（テストで実行環境の Cf と照合する）。
 */
export const FORMAT_CHARACTER_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x00ad, 0x00ad],
  [0x0600, 0x0605],
  [0x061c, 0x061c],
  [0x06dd, 0x06dd],
  [0x070f, 0x070f],
  [0x0890, 0x0891],
  [0x08e2, 0x08e2],
  [0x180e, 0x180e],
  [0x200b, 0x200f],
  [0x202a, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
  [0xfff9, 0xfffb],
  [0x110bd, 0x110bd],
  [0x110cd, 0x110cd],
  [0x13430, 0x1343f],
  [0x1bca0, 0x1bca3],
  [0x1d173, 0x1d17a],
  [0xe0001, 0xe0001],
  [0xe0020, 0xe007f],
];

/**
 * 書式文字のうち、表示名に使ってよいもの（R21 軽微2、§9.18-1）。
 * ZWNJ（U+200C）・ZWJ（U+200D）: 家族・職業などの絵文字の合字と、ZWNJ を使う言語の名前のため。
 * タグ文字（U+E0020–U+E007F）: イングランドなどの地域旗のため。
 * DB 関数 public.contains_format_character（0014）も同じ範囲を除いて調べる。
 */
export const ALLOWED_FORMAT_CHARACTER_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200c, 0x200d],
  [0xe0020, 0xe007f],
];

function inRanges(cp: number, ranges: ReadonlyArray<readonly [number, number]>): boolean {
  return ranges.some(([from, to]) => cp >= from && cp <= to);
}

/** 表示名に使えない見えない文字（許すもの以外の書式文字）を含むか。 */
function containsInvisibleCharacter(value: string): boolean {
  for (const ch of value) {
    const cp = ch.codePointAt(0) ?? 0;
    if (inRanges(cp, FORMAT_CHARACTER_RANGES) && !inRanges(cp, ALLOWED_FORMAT_CHARACTER_RANGES)) return true;
  }
  return false;
}

// 改行・タブを含む制御文字（C0・DEL・C1）と、行区切り・段落区切り。
const CONTROL_CHARACTERS = new RegExp("[\u0000-\u001f\u007f-\u009f\u2028\u2029]");
// 「@（全角の＠も）の前後に、空白でない文字がある」ものをメールアドレスの形とみなす。
const EMAIL_SHAPE = /[^\s@＠][@＠][^\s@＠]/;

/** 前後の空白（全角空白・改行を含む）を除き、規則に合うかを調べる。 */
export function validateDisplayName(raw: string): DisplayNameValidation {
  // 見えない文字は前後の空白を除く前に調べる（trim は U+FEFF を空白として消すが、DB は消さずに拒否するため）。
  if (containsInvisibleCharacter(raw)) return { ok: false, message: DISPLAY_NAME_MESSAGES.invisible };
  const name = raw.trim();
  if (name.length === 0) return { ok: false, message: DISPLAY_NAME_MESSAGES.empty };
  if ([...name].length > DISPLAY_NAME_MAX_LENGTH) return { ok: false, message: DISPLAY_NAME_MESSAGES.tooLong };
  if (CONTROL_CHARACTERS.test(name)) return { ok: false, message: DISPLAY_NAME_MESSAGES.control };
  if (EMAIL_SHAPE.test(name)) return { ok: false, message: DISPLAY_NAME_MESSAGES.email };
  return { ok: true, name };
}

/** 利用者にそのまま見せてよい、表示名の拒否理由か。 */
export function isDisplayNameMessage(message: string): boolean {
  return (Object.values(DISPLAY_NAME_MESSAGES) as string[]).includes(message);
}
