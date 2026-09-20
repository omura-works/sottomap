// お問い合わせ（docs/SPEC.md §9.17）の用件・文字数・入力検査。
//
// 画面（クライアントコンポーネント）と Server Action / データアクセス層の両方から使うため、
// サーバー専用の依存（next/headers を辿る Supabase クライアント）を一切持たない。
// 検査の規則と拒否文言は DB 関数 submit_contact_message（0009_contact_messages.sql）に合わせる。

export const CONTACT_CATEGORIES = ["removal", "correction", "other"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/** 用件の日本語ラベル（画面のラジオと同じ文言）。 */
export const CONTACT_CATEGORY_OPTIONS: readonly { value: ContactCategory; label: string }[] = [
  { value: "removal", label: "掲載を止めてほしい" },
  { value: "correction", label: "内容の訂正" },
  { value: "other", label: "その他" },
];

export const CONTACT_MESSAGE_MAX_LENGTH = 2000;
export const CONTACT_REPLY_TO_MAX_LENGTH = 320;

export interface ContactMessageInput {
  category: ContactCategory;
  message: string;
  replyTo: string | null;
  spotId: string | null;
}

/** 検査に落ちた理由。画面はこの文言をそのまま、対象の入力欄のそばに出す。 */
export const CONTACT_ERRORS = {
  category: "用件を選んでください",
  messageEmpty: "お問い合わせの内容を入力してください",
  messageTooLong: `お問い合わせの内容は${CONTACT_MESSAGE_MAX_LENGTH}字以内で入力してください`,
  replyTo: "メールアドレスの形をご確認ください",
  spot: "お店の情報が取得できませんでした",
} as const;

/** PostgreSQL の char_length と同じく、コードポイント単位で数える。 */
function charLength(value: string): number {
  return Array.from(value).length;
}

/** DB 側の btrim と同じ除去文字（半角空白・タブ・改行類・全角空白）で前後を削る。 */
const BLANK_CHARS = /^[ \t\n\v\f\r　]+|[ \t\n\v\f\r　]+$/g;

function stripBlank(value: string): string {
  return value.replace(BLANK_CHARS, "");
}

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string" && (CONTACT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * submit_contact_message（0009）と同じ入力検査。検査の順序とエラー文も DB 関数に合わせる。
 * 戻り値は DB が保存する形（本文はそのまま、返信先は前後の空白を除き、空なら null）。
 */
export function validateContactMessageInput(input: {
  category: string | null;
  message: string;
  replyTo: string | null;
  spotId: string | null;
}): ContactMessageInput {
  if (!isContactCategory(input.category)) {
    throw new Error(CONTACT_ERRORS.category);
  }
  const message = input.message;
  if (stripBlank(message) === "") {
    throw new Error(CONTACT_ERRORS.messageEmpty);
  }
  if (charLength(message) > CONTACT_MESSAGE_MAX_LENGTH) {
    throw new Error(CONTACT_ERRORS.messageTooLong);
  }

  const trimmedReplyTo = input.replyTo === null ? "" : stripBlank(input.replyTo);
  const replyTo = trimmedReplyTo === "" ? null : trimmedReplyTo;
  if (replyTo !== null) {
    const at = replyTo.indexOf("@") + 1; // strpos と同じ1始まり（無ければ0）
    if (charLength(replyTo) > CONTACT_REPLY_TO_MAX_LENGTH || at < 2 || at === charLength(replyTo)) {
      throw new Error(CONTACT_ERRORS.replyTo);
    }
  }

  return { category: input.category, message, replyTo, spotId: input.spotId };
}

