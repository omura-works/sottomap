// お問い合わせ（docs/SPEC.md §9.17）の用件・文字数・入力検査。
//
// 画面（クライアントコンポーネント）と Server Action / データアクセス層の両方から使うため、
// サーバー専用の依存（next/headers を辿る Supabase クライアント）を一切持たない。
// 検査の規則と拒否文言は DB 関数 submit_contact_message（0013_contact_privacy_requests.sql）に合わせる。

export const CONTACT_CATEGORIES = ["removal", "correction", "privacy", "other"] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

/** 用件の日本語ラベル（画面のラジオと同じ文言）。 */
export const CONTACT_CATEGORY_OPTIONS: readonly { value: ContactCategory; label: string }[] = [
  { value: "removal", label: "掲載を止めてほしい" },
  { value: "correction", label: "内容の訂正" },
  { value: "privacy", label: "自分の個人情報について（開示・訂正・削除・利用停止）" },
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
  /**
   * 個人情報の請求（privacy）を未ログインで送るときは、返信先が必須（R20 重要3）。
   * 運営が、登録している（退会した場合は登録していた）メールアドレス宛に確認して本人確認するため。
   */
  privacyReplyTo: "ログインせずに送る場合は、本人確認のため、返信用のメールアドレスを入力してください。",
  /** 送信元ごと・全体の回数制限、容量の上限に達したとき。 */
  rateLimited: "しばらく時間をおいてから送ってください。",
} as const;

/** 未ログインで privacy を選んだときのログインへの導線（戻り先は /contact）。 */
export const CONTACT_LOGIN_HREF = "/login?next=%2Fcontact";

/**
 * 個人情報の請求（privacy）の案内（SPEC §9.17-4。R20 重要3）。
 * - ログイン中: そのアカウントのご本人からの請求として受け付け、アカウントのメールアドレス宛に回答する。
 * - ログインできない人・退会した人: 返信先を必須にし、運営がそのアドレス宛にメールで確認して本人確認する。
 */
export const CONTACT_PRIVACY_COPY = {
  guestNote:
    "ログインして送ると、そのアカウントのご本人からの請求として受け付けます。ログインできない場合や退会した場合は、返信用のメールアドレスに、登録している（退会した場合は、登録していた）メールアドレスを書いて送ってください。運営からそのアドレス宛にメールで確認し、ご本人であることを確かめてから回答します。",
  guestReplyToHint:
    "登録している（退会した場合は、登録していた）メールアドレスをご記入ください。本人確認のため、運営からこのアドレス宛にメールで確認します。",
  memberReplyToHint: "個人情報についての回答は、アカウントに登録しているメールアドレス宛にお送りします。",
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

/**
 * 返信先の中に含めてはいけない空白・改行・制御文字（DB 関数の v_forbidden と同じ集合）。
 * U+0001〜U+0020、U+007F〜U+00A0、U+1680、U+2000〜U+200B、U+2028、U+2029、U+202F、U+205F、U+3000、U+FEFF。
 */
const EMAIL_FORBIDDEN = /[\u0000-\u0020\u007F-\u00A0\u1680\u2000-\u200B\u2028\u2029\u202F\u205F\u3000\uFEFF]/;

/**
 * 返信先メールアドレスの形の検査（DB 関数と同じ規則）。前後の空白は呼び出し側で除いておく。
 * 空白・改行・制御文字を含まない、@ がちょうど1つ、ローカル部とドメイン部が空でない、
 * ドメインに . を含む、320字以内。
 */
export function isValidReplyTo(value: string): boolean {
  if (charLength(value) > CONTACT_REPLY_TO_MAX_LENGTH) return false;
  if (EMAIL_FORBIDDEN.test(value)) return false;
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local !== "" && domain !== "" && domain.includes(".");
}

export function isContactCategory(value: unknown): value is ContactCategory {
  return typeof value === "string" && (CONTACT_CATEGORIES as readonly string[]).includes(value);
}

/**
 * submit_contact_message（0013）と同じ入力検査。検査の順序とエラー文も DB 関数に合わせる。
 * 戻り値は DB が保存する形（本文はそのまま、返信先は前後の空白を除き、空なら null）。
 * requesterId はログイン中の利用者の ID（未ログインなら null）。privacy では requesterId か返信先のどちらかが必須。
 */
export function validateContactMessageInput(input: {
  category: string | null;
  message: string;
  replyTo: string | null;
  spotId: string | null;
  requesterId?: string | null;
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
  if (replyTo !== null && !isValidReplyTo(replyTo)) {
    throw new Error(CONTACT_ERRORS.replyTo);
  }
  if (input.category === "privacy" && !input.requesterId && replyTo === null) {
    throw new Error(CONTACT_ERRORS.privacyReplyTo);
  }

  return { category: input.category, message, replyTo, spotId: input.spotId };
}

