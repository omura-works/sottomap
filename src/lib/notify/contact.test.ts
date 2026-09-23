// 運営への通知（SPEC §9.17）。設定があれば1回だけ送り、無ければ送らない。
// 通知メールには用件・受付ID・受付時刻だけを書き、問い合わせの本文や返信先を載せないことを確かめる。
import { describe, expect, it, vi } from "vitest";
import {
  buildContactNotificationEmail,
  notifyContactReceived,
  readContactNotifyConfig,
  RESEND_EMAILS_ENDPOINT,
} from "./contact";

const NOTIFICATION = {
  id: "aaaa0000-0000-4000-8000-000000000001",
  category: "removal" as const,
  receivedAt: "2026-09-23T05:05:09.000Z",
};

const CONFIGURED = { RESEND_API_KEY: "re_test_key", CONTACT_NOTIFY_TO: "ops@example.com" };

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }));
}

describe("readContactNotifyConfig", () => {
  it("RESEND_API_KEY と CONTACT_NOTIFY_TO の両方があるときだけ設定ありとする", () => {
    expect(readContactNotifyConfig(CONFIGURED)).not.toBeNull();
    expect(readContactNotifyConfig({ RESEND_API_KEY: "re_test_key" })).toBeNull();
    expect(readContactNotifyConfig({ CONTACT_NOTIFY_TO: "ops@example.com" })).toBeNull();
    expect(readContactNotifyConfig({ RESEND_API_KEY: " ", CONTACT_NOTIFY_TO: " " })).toBeNull();
  });
});

describe("notifyContactReceived", () => {
  it("設定があれば Resend の API を1回だけ呼ぶ", async () => {
    const fetchImpl = okFetch();
    await expect(notifyContactReceived(NOTIFICATION, { env: CONFIGURED, fetchImpl })).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(RESEND_EMAILS_ENDPOINT);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");
    const body = JSON.parse(String(init.body)) as { to: string[]; subject: string; text: string };
    expect(body.to).toEqual(["ops@example.com"]);
    expect(body.text).toContain(NOTIFICATION.id);
    expect(body.text).toContain("掲載を止めてほしい");
    expect(body.text).toContain("2026-09-23 14:05:09（日本時間）");
  });

  it("設定が無ければ何もしない（fetch を呼ばない）", async () => {
    const fetchImpl = okFetch();
    await expect(notifyContactReceived(NOTIFICATION, { env: {}, fetchImpl })).resolves.toBe(false);
    await notifyContactReceived(NOTIFICATION, { env: { RESEND_API_KEY: "re_test_key" }, fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("送信に失敗しても例外を投げず、console.error に記録する", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = vi.fn(async () => new Response("{}", { status: 500 }));
    await expect(notifyContactReceived(NOTIFICATION, { env: CONFIGURED, fetchImpl: failing })).resolves.toBe(true);
    const throwing = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(notifyContactReceived(NOTIFICATION, { env: CONFIGURED, fetchImpl: throwing })).resolves.toBe(true);
    expect(errorSpy).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });
});

describe("buildContactNotificationEmail", () => {
  it("用件・受付ID・受付時刻だけを書き、問い合わせの本文や返信先の欄を持たない", () => {
    const email = buildContactNotificationEmail(NOTIFICATION);
    const lines = email.text.split("\n").filter((line) => line.includes(":"));
    expect(lines.map((line) => line.split(":")[0])).toEqual(["用件", "受付ID", "受付時刻"]);
    expect(email.text).not.toContain("返信");
    expect(email.text).not.toContain("@");
  });
});
