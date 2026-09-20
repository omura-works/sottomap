"use server";

// /contact お問い合わせフォームの Server Action（docs/SPEC.md §9.17）。
// 失敗は例外にせず状態として返す（SPEC §9.14-7。画面は role="alert" で知らせる）。

import { CONTACT_ERRORS } from "@/app/contact/schema";
import { submitContactMessage } from "@/lib/db/contact";

export type ContactField = "category" | "message" | "replyTo";

export type ContactActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; field?: ContactField };

const GENERIC_ERROR = "お送りできませんでした。時間をおいて、もう一度お試しください。";

/** 利用者にそのまま見せてよい拒否理由と、その理由が属する入力欄。 */
const FIELD_BY_MESSAGE = new Map<string, ContactField | undefined>([
  [CONTACT_ERRORS.category, "category"],
  [CONTACT_ERRORS.messageEmpty, "message"],
  [CONTACT_ERRORS.messageTooLong, "message"],
  [CONTACT_ERRORS.replyTo, "replyTo"],
  [CONTACT_ERRORS.spot, undefined],
]);

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * お問い合わせを送る。成功しても内容は画面に残さない（入力欄を閉じてお礼だけ出す）。
 * 直近1分以内の同じ内容は DB（デモモードはフィクスチャ）が二重に保存せず、成功として返る。
 */
export async function submitContactAction(
  _prevState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const category = readString(formData, "category");
  const spotId = readString(formData, "spotId");

  try {
    await submitContactMessage({
      category: category === "" ? null : category,
      message: readString(formData, "message"),
      replyTo: readString(formData, "replyTo") || null,
      spotId: spotId === "" ? null : spotId,
    });
    return { status: "success" };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    if (FIELD_BY_MESSAGE.has(raw)) {
      const field = FIELD_BY_MESSAGE.get(raw);
      return field ? { status: "error", message: raw, field } : { status: "error", message: raw };
    }
    return { status: "error", message: GENERIC_ERROR };
  }
}
