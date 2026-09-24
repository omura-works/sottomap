// /contact の Server Action（SPEC §9.17）。デモモード（フィクスチャ）で動かし、
// 送信者・User-Agent・送信元をリクエストから集めて渡すこと、保存できたら運営へ1回だけ通知すること、
// 通知に問い合わせの本文や返信先を載せないことを確かめる。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getCurrentUserId } from "@/lib/auth";
import { CONTACT_ERRORS } from "@/app/contact/schema";
import { FIXTURE_CONTACT_MESSAGES } from "@/lib/db/fixtures";
import { submitContactAction } from "./contact";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("利用者のセッションの接続は使わない");
  }),
  createServiceRoleClient: vi.fn(() => ({ rpc })),
}));

const MESSAGE = "この店の掲載を止めてください。本文に固有の文字列XYZ";
const REPLY_TO = "owner-secret@example.com";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  FIXTURE_CONTACT_MESSAGES.length = 0;
  vi.mocked(headers).mockResolvedValue(
    new Headers({ "user-agent": "U".repeat(300), "x-forwarded-for": "203.0.113.7, 10.0.0.1" }) as never,
  );
  vi.mocked(getCurrentUserId).mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("submitContactAction", () => {
  it("ブラウザの User-Agent を200字で切って記録する", async () => {
    await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));
    expect(FIXTURE_CONTACT_MESSAGES[0]?.userAgent).toBe("U".repeat(200));
  });

  it("Supabase 経路では service_role の RPC に、送信元 IP のハッシュ・送信者・User-Agent を渡す", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("CONTACT_RATE_SALT", "test-salt");
    vi.mocked(getCurrentUserId).mockResolvedValue("44440000-0000-4000-8000-00000000000a");
    rpc.mockResolvedValueOnce({ data: "aaaa0000-0000-4000-8000-000000000001", error: null });

    const state = await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));

    expect(state).toEqual({ status: "success", category: "other" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[1]).toMatchObject({
      p_source_hash: createHash("sha256").update("203.0.113.7test-salt").digest("hex"),
      p_requester_id: "44440000-0000-4000-8000-00000000000a",
      p_user_agent: "U".repeat(200),
    });
  });

  it("回数制限に達したら、その文言をフォーム全体のエラーとして返す", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
    vi.stubEnv("CONTACT_RATE_SALT", "test-salt");
    rpc.mockResolvedValueOnce({ data: null, error: { message: CONTACT_ERRORS.rateLimited, hint: "contact_rate_source" } });

    const state = await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));
    expect(state).toEqual({ status: "error", message: CONTACT_ERRORS.rateLimited });
  });

  it("ログイン中なら送信者（requesterId）を記録する", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("b0000000-0000-4000-8000-000000000004");
    const state = await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));

    expect(state).toEqual({ status: "success", category: "other" });
    expect(FIXTURE_CONTACT_MESSAGES[0]?.requesterId).toBe("b0000000-0000-4000-8000-000000000004");
  });

  it("未ログインで privacy を選び、返信先が無ければ、返信先の欄の文言で拒否する", async () => {
    const state = await submitContactAction({ status: "idle" }, form({ category: "privacy", message: MESSAGE }));
    expect(state).toEqual({ status: "error", message: CONTACT_ERRORS.privacyReplyTo, field: "replyTo" });
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(0);
  });

  it("未ログインでも返信先を書けば privacy を受け付け、成功の状態に用件を載せる（R20 重要3）", async () => {
    const state = await submitContactAction(
      { status: "idle" },
      form({ category: "privacy", message: MESSAGE, replyTo: REPLY_TO }),
    );
    expect(state).toEqual({ status: "success", category: "privacy" });
    expect(FIXTURE_CONTACT_MESSAGES[0]?.requesterId).toBeNull();
    expect(FIXTURE_CONTACT_MESSAGES[0]?.replyTo).toBe(REPLY_TO);
  });

  it("通知の設定があれば、保存のあと運営へ1回だけ通知し、本文と返信先を載せない", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("CONTACT_NOTIFY_TO", "ops@example.com");

    const state = await submitContactAction(
      { status: "idle" },
      form({ category: "removal", message: MESSAGE, replyTo: REPLY_TO }),
    );

    expect(state).toEqual({ status: "success", category: "removal" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    const body = String(init.body);
    expect(body).not.toContain("固有の文字列XYZ");
    expect(body).not.toContain(REPLY_TO);
    expect(body).toContain(FIXTURE_CONTACT_MESSAGES[0]?.id ?? "no-id");
  });

  it("通知の設定が無ければ通知しない", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("CONTACT_NOTIFY_TO", "");
    const state = await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));
    expect(state).toEqual({ status: "success", category: "other" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("重複として保存しなかった送信は通知しない", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("CONTACT_NOTIFY_TO", "ops@example.com");
    await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));
    await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("通知に失敗しても保存は取り消さず、成功として返す", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("CONTACT_NOTIFY_TO", "ops@example.com");
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await submitContactAction({ status: "idle" }, form({ category: "other", message: MESSAGE }));
    expect(state).toEqual({ status: "success", category: "other" });
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
