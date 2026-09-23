"use server";

// /contact お問い合わせフォームの Server Action（docs/SPEC.md §9.17）。
// 失敗は例外にせず状態として返す（SPEC §9.14-7。画面は role="alert" で知らせる）。
// DB への書き込みはサーバー専用の service_role 接続で行う（src/lib/db/contact.ts）。ここでは
// ブラウザから直接は渡せない情報（ログイン中の利用者・User-Agent・送信元 IP）をリクエストから集める。

import { headers } from "next/headers";
import { CONTACT_ERRORS } from "@/app/contact/schema";
import { getCurrentUserId } from "@/lib/auth";
import { submitContactMessage } from "@/lib/db/contact";
import { notifyContactReceived } from "@/lib/notify/contact";

export type ContactField = "category" | "message" | "replyTo";

export type ContactActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; field?: ContactField };

const GENERIC_ERROR = "お送りできませんでした。時間をおいて、もう一度お試しください。";

/** User-Agent は200字（コードポイント単位）で切って保存する。 */
const USER_AGENT_MAX_LENGTH = 200;

/** 利用者にそのまま見せてよい拒否理由と、その理由が属する入力欄。 */
const FIELD_BY_MESSAGE = new Map<string, ContactField | undefined>([
  [CONTACT_ERRORS.category, "category"],
  [CONTACT_ERRORS.privacyLogin, "category"],
  [CONTACT_ERRORS.messageEmpty, "message"],
  [CONTACT_ERRORS.messageTooLong, "message"],
  [CONTACT_ERRORS.replyTo, "replyTo"],
  [CONTACT_ERRORS.spot, undefined],
  [CONTACT_ERRORS.rateLimited, undefined],
]);

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function truncateUserAgent(value: string | null): string | null {
  if (!value) return null;
  const truncated = Array.from(value).slice(0, USER_AGENT_MAX_LENGTH).join("");
  return truncated === "" ? null : truncated;
}

/**
 * 送信元の IP。Vercel はクライアントの IP を x-real-ip / x-forwarded-for の先頭に入れる
 * （利用者が送った同名のヘッダーは Vercel が上書きする）。取れなければ null。
 */
function readClientIp(requestHeaders: Headers): string | null {
  const realIp = requestHeaders.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? forwarded : null;
}

/**
 * お問い合わせを送る。成功しても内容は画面に残さない（入力欄を閉じてお礼だけ出す）。
 * 直近1分以内の同じ送信は DB（デモモードはフィクスチャ）が二重に保存せず、成功として返る。
 * 保存できたら運営へ通知する（設定があるときだけ。失敗しても保存は取り消さない）。
 */
export async function submitContactAction(
  _prevState: ContactActionState,
  formData: FormData,
): Promise<ContactActionState> {
  const category = readString(formData, "category");
  const spotId = readString(formData, "spotId");

  try {
    const requestHeaders = await headers();
    const requesterId = await getCurrentUserId();
    const receipt = await submitContactMessage({
      category: category === "" ? null : category,
      message: readString(formData, "message"),
      replyTo: readString(formData, "replyTo") || null,
      spotId: spotId === "" ? null : spotId,
      requesterId,
      userAgent: truncateUserAgent(requestHeaders.get("user-agent")),
      sourceIp: readClientIp(requestHeaders),
    });
    if (receipt) {
      await notifyContactReceived(receipt);
    }
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
