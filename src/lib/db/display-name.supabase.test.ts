// 表示名の変更（SPEC §9.18-1、R23 重要1）の Supabase 経路。
// DB 関数 set_display_name は service_role にしか EXECUTE が無い（0016）。Server Action が本人の ID をサーバー側で
// 確かめてから、サーバー専用の service_role 接続で呼ぶ。アプリの検査に通らない名前は DB に送らない。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createServiceRoleClient } from "../supabase/server";
import { setUserDisplayName } from "./mutations";

const rpc = vi.hoisted(() => vi.fn());

vi.mock("../supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("利用者のセッションの接続は使わない");
  }),
  createServiceRoleClient: vi.fn(() => ({ rpc })),
}));

const USER_ID = "44440000-0000-4000-8000-00000000000b";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("URASUPO_DEMO_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  rpc.mockResolvedValue({ data: "灯りの人", error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("setUserDisplayName（Supabase 経路）", () => {
  it("service_role の接続で、本人の ID と前後の空白を除いた名前を渡す", async () => {
    const saved = await setUserDisplayName(USER_ID, "  灯りの人 ");

    expect(saved).toBe("灯りの人");
    expect(createServiceRoleClient).toHaveBeenCalledTimes(1);
    expect(createClient).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("set_display_name", { p_user_id: USER_ID, p_name: "灯りの人" });
  });

  it("アプリの検査に通らない名前（ZWNJ を含む）は DB に送らない", async () => {
    await expect(setUserDisplayName(USER_ID, "ab‌cd")).rejects.toThrow("表示名に見えない文字は使えません");
    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("DB の拒否の文言はそのまま返す", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "表示名に見えない文字は使えません" } });
    await expect(setUserDisplayName(USER_ID, "灯りの人")).rejects.toThrow("表示名に見えない文字は使えません");
  });
});
