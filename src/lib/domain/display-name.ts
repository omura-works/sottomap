// SPEC §9.18-1: 表示名の規則。DB 関数 set_display_name（0011）と同じ規則・同じ文言にそろえる。
// Server Action は通信の前にここで弾き、デモモード（フィクスチャ）もこの規則で保存する。

/** ログイン時に作るプロフィールの表示名（メールアドレスの一部は使わない）。 */
export const DEFAULT_DISPLAY_NAME = "地元の人";

export const DISPLAY_NAME_MAX_LENGTH = 20;

export const DISPLAY_NAME_MESSAGES = {
  empty: "表示名を入力してください",
  tooLong: `表示名は${DISPLAY_NAME_MAX_LENGTH}文字以内で入力してください`,
  control: "表示名に改行や制御文字は使えません",
  email: "表示名にメールアドレスは使えません",
} as const;

export type DisplayNameValidation = { ok: true; name: string } | { ok: false; message: string };

// 改行・タブを含む制御文字（C0・DEL・C1）と、行区切り・段落区切り。
const CONTROL_CHARACTERS = new RegExp("[\u0000-\u001f\u007f-\u009f\u2028\u2029]");
// 「@（全角の＠も）の前後に、空白でない文字がある」ものをメールアドレスの形とみなす。
const EMAIL_SHAPE = /[^\s@＠][@＠][^\s@＠]/;

/** 前後の空白（全角空白・改行を含む）を除き、規則に合うかを調べる。 */
export function validateDisplayName(raw: string): DisplayNameValidation {
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
