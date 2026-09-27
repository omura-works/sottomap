// お問い合わせを受け付けたことを運営へ知らせる（docs/SPEC.md §9.17、任意）。
//
// RESEND_API_KEY と CONTACT_NOTIFY_TO が両方設定されているときだけ、Resend の HTTP API
// （https://api.resend.com/emails）へ fetch で送る。新しい依存は追加しない。
// メールに個人情報を流さないため、本文には「用件・受付ID・受付時刻」だけを書き、
// 問い合わせの本文や返信先は載せない（内容は運営が Supabase の画面で読む）。
// 送信に失敗しても問い合わせの保存は取り消さない（console.error に記録するだけ）。

import { CONTACT_CATEGORY_OPTIONS, type ContactCategory } from "@/app/contact/schema";

export const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";

/** CONTACT_NOTIFY_FROM が未設定のときの送信元（Resend の検証用アドレス。本番は独自ドメインの送信元を設定する）。 */
export const DEFAULT_CONTACT_NOTIFY_FROM = "そっとマップ <onboarding@resend.dev>";

/** 通知の送信を待つ上限（Server Action の応答を長く止めない）。 */
const NOTIFY_TIMEOUT_MS = 5000;

export interface ContactNotification {
  id: string;
  category: ContactCategory;
  /** 受付時刻（ISO 8601）。 */
  receivedAt: string;
}

export interface ContactNotifyConfig {
  apiKey: string;
  to: string[];
  from: string;
}

type EnvLike = Record<string, string | undefined>;

/** 通知の設定を読む。RESEND_API_KEY と CONTACT_NOTIFY_TO の両方が無ければ null（通知しない）。 */
export function readContactNotifyConfig(env: EnvLike = process.env): ContactNotifyConfig | null {
  const apiKey = env.RESEND_API_KEY?.trim();
  const to = (env.CONTACT_NOTIFY_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter((address) => address !== "");
  if (!apiKey || to.length === 0) return null;
  const from = env.CONTACT_NOTIFY_FROM?.trim() || DEFAULT_CONTACT_NOTIFY_FROM;
  return { apiKey, to, from };
}

function categoryLabel(category: ContactCategory): string {
  return CONTACT_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? category;
}

/** 受付時刻を日本時間で表す（例: 2026-09-23 14:05:09（日本時間））。 */
function formatJst(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const jst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${jst.getUTCFullYear()}-${pad(jst.getUTCMonth() + 1)}-${pad(jst.getUTCDate())} ` +
    `${pad(jst.getUTCHours())}:${pad(jst.getUTCMinutes())}:${pad(jst.getUTCSeconds())}（日本時間）`
  );
}

/** 通知メールの件名と本文。問い合わせの本文・返信先は受け取らないので、載せようがない。 */
export function buildContactNotificationEmail(notification: ContactNotification): {
  subject: string;
  text: string;
} {
  const label = categoryLabel(notification.category);
  return {
    subject: `【そっとマップ】お問い合わせが届きました（${label}）`,
    text: [
      "そっとマップにお問い合わせが届きました。",
      "",
      `用件: ${label}`,
      `受付ID: ${notification.id}`,
      `受付時刻: ${formatJst(notification.receivedAt)}`,
      "",
      "内容は Supabase の画面（contact_messages）で確認してください。",
    ].join("\n"),
  };
}

/**
 * 運営へ通知する。設定が無ければ何もしない。失敗しても例外を投げず console.error に記録する。
 * @returns 送信を試みたか（設定があって fetch を呼んだら true）
 */
export async function notifyContactReceived(
  notification: ContactNotification,
  options: { env?: EnvLike; fetchImpl?: typeof fetch } = {},
): Promise<boolean> {
  const config = readContactNotifyConfig(options.env ?? process.env);
  if (!config) return false;

  const fetchImpl = options.fetchImpl ?? fetch;
  const { subject, text } = buildContactNotificationEmail(notification);
  try {
    const response = await fetchImpl(RESEND_EMAILS_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        // 同じ受付を二重に通知しないための鍵（Resend の冪等キー）。
        "Idempotency-Key": `contact-${notification.id}`,
      },
      body: JSON.stringify({ from: config.from, to: config.to, subject, text }),
      signal: AbortSignal.timeout(NOTIFY_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(
        `[contact-notify] 運営への通知に失敗しました（HTTP ${response.status}）。受付ID: ${notification.id}`,
      );
    }
  } catch (error) {
    console.error(
      `[contact-notify] 運営への通知に失敗しました（${error instanceof Error ? error.message : String(error)}）。受付ID: ${notification.id}`,
    );
  }
  return true;
}
