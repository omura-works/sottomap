// 退会の記録（account_deletion_log、0015）の日次削除（SPEC §9.17、R22 決定事項）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purgeExpiredAccountDeletionLog } from "./account-deletion";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => {
    throw new Error("利用者のセッションの接続は使わない");
  }),
  createServiceRoleClient: vi.fn(() => ({ rpc })),
}));

function useSupabase(): void {
  vi.stubEnv("URASUPO_DEMO_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("purgeExpiredAccountDeletionLog", () => {
  it("デモモードでは記録が無いので0件", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "1");
    await expect(purgeExpiredAccountDeletionLog()).resolves.toEqual({ deletedLogs: 0 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Supabase 経路では service_role の RPC purge_expired_account_deletion_log を引数なしで呼び、件数を返す", async () => {
    useSupabase();
    rpc.mockResolvedValueOnce({ data: 4, error: null });
    await expect(purgeExpiredAccountDeletionLog()).resolves.toEqual({ deletedLogs: 4 });
    expect(rpc).toHaveBeenCalledWith("purge_expired_account_deletion_log");
  });

  it("RPC の失敗・読めない結果は例外にする", async () => {
    useSupabase();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "db down" } });
    await expect(purgeExpiredAccountDeletionLog()).rejects.toThrow("退会の記録の削除に失敗しました: db down");
    rpc.mockResolvedValueOnce({ data: "x", error: null });
    await expect(purgeExpiredAccountDeletionLog()).rejects.toThrow("退会の記録の削除の結果を読み取れませんでした");
  });
});
