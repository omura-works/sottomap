// お問い合わせ（SPEC §9.17）の Supabase 経路。
// RPC submit_contact_message は service_role にしか EXECUTE が無いため、サーバー専用の
// service_role 接続で呼ぶこと・送信元は IP そのものではなくソルト付きハッシュで渡すことを確かめる。
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createServiceRoleClient } from "../supabase/server";
import { CONTACT_ERRORS } from "@/app/contact/schema";
import { purgeExpiredContactData, submitContactMessage } from "./contact";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("../supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("利用者のセッションの接続は使わない");
  }),
  createServiceRoleClient: vi.fn(() => ({ rpc })),
}));

const INPUT = {
  category: "removal",
  message: "この店の掲載を止めてください。",
  replyTo: "owner@example.com",
  spotId: null,
  requesterId: "44440000-0000-4000-8000-00000000000a",
  userAgent: "Mozilla/5.0 (テスト)",
  sourceIp: "203.0.113.7",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("URASUPO_DEMO_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  vi.stubEnv("CONTACT_RATE_SALT", "test-salt");
  rpc.mockResolvedValue({ data: "aaaa0000-0000-4000-8000-000000000001", error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("submitContactMessage（Supabase 経路）", () => {
  it("service_role の接続で RPC を呼び、利用者のセッションの接続は使わない", async () => {
    const receipt = await submitContactMessage(INPUT);

    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]?.[0]).toBe("submit_contact_message");
    expect(receipt).toMatchObject({ id: "aaaa0000-0000-4000-8000-000000000001", category: "removal" });
  });

  it("送信者・User-Agent・送信元のハッシュを渡し、IP そのものは渡さない", async () => {
    await submitContactMessage(INPUT);

    const args = rpc.mock.calls[0]?.[1] as Record<string, unknown>;
    const expectedHash = createHash("sha256").update("203.0.113.7test-salt").digest("hex");
    expect(args).toEqual({
      p_category: "removal",
      p_message: "この店の掲載を止めてください。",
      p_reply_to: "owner@example.com",
      p_spot_id: null,
      p_source_hash: expectedHash,
      p_requester_id: "44440000-0000-4000-8000-00000000000a",
      p_user_agent: "Mozilla/5.0 (テスト)",
    });
    expect(JSON.stringify(args)).not.toContain("203.0.113.7");
  });

  it("CONTACT_RATE_SALT が未設定なら、送信時に拒否して RPC を呼ばない", async () => {
    vi.stubEnv("CONTACT_RATE_SALT", "");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(submitContactMessage(INPUT)).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("回数制限の拒否は、その文言のまま返す", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: CONTACT_ERRORS.rateLimited, hint: "contact_rate_source" },
    });
    await expect(submitContactMessage(INPUT)).rejects.toThrow(CONTACT_ERRORS.rateLimited);
  });

  it("重複（RPC が null）なら受付の記録を返さない", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(submitContactMessage(INPUT)).resolves.toBeNull();
  });
});

describe("purgeExpiredContactData（Supabase 経路）", () => {
  it("service_role の接続で purge_expired_contact_data を呼び、削除件数を返す", async () => {
    rpc.mockResolvedValueOnce({ data: { deletedMessages: 3, deletedRates: 7 }, error: null });
    await expect(purgeExpiredContactData(new Date())).resolves.toEqual({ deletedMessages: 3, deletedRates: 7 });
    expect(rpc).toHaveBeenCalledWith("purge_expired_contact_data");
    expect(createClient).not.toHaveBeenCalled();
  });
});
