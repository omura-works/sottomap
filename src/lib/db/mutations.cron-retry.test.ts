import { beforeEach, describe, expect, it, vi } from "vitest";

// Supabase 経路（service-role で run_verification_cron を呼ぶ）の再実行を検証する（Spec §9.13.8）。
type RpcResponse = { data: unknown; error: { code?: string; message: string } | null };

const rpc = vi.fn<(name: string) => Promise<RpcResponse>>();

vi.mock("../supabase/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../supabase/env")>();
  return { ...actual, isSupabaseConfigured: () => true };
});

vi.mock("../supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: () => ({ rpc }),
}));

const CRON_RESULT = {
  checked: 3,
  changed: 1,
  missedRequestCount: 0,
  createdRequestCount: 1,
  skippedLockedCount: 2,
};

function deadlock(code: string): RpcResponse {
  return { data: null, error: { code, message: `transaction aborted (${code})` } };
}

describe("runVerificationCron（Supabase 経路）", () => {
  beforeEach(() => {
    rpc.mockReset();
  });

  it("run_verification_cron の結果（skippedLockedCount を含む）を返す", async () => {
    rpc.mockResolvedValueOnce({ data: CRON_RESULT, error: null });
    const { runVerificationCron } = await import("./mutations");
    await expect(runVerificationCron(new Date())).resolves.toEqual(CRON_RESULT);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("run_verification_cron");
  });

  it("40P01（デッドロック）なら1回だけ再実行する", async () => {
    rpc.mockResolvedValueOnce(deadlock("40P01")).mockResolvedValueOnce({ data: CRON_RESULT, error: null });
    const { runVerificationCron } = await import("./mutations");
    await expect(runVerificationCron(new Date())).resolves.toEqual(CRON_RESULT);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("40001（直列化失敗）なら1回だけ再実行する", async () => {
    rpc.mockResolvedValueOnce(deadlock("40001")).mockResolvedValueOnce({ data: CRON_RESULT, error: null });
    const { runVerificationCron } = await import("./mutations");
    await expect(runVerificationCron(new Date())).resolves.toEqual(CRON_RESULT);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("再実行でも失敗したら、それ以上は再実行せず例外にする", async () => {
    rpc.mockResolvedValue(deadlock("40P01"));
    const { runVerificationCron } = await import("./mutations");
    await expect(runVerificationCron(new Date())).rejects.toThrow("40P01");
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("それ以外のエラーは再実行しない", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    const { runVerificationCron } = await import("./mutations");
    await expect(runVerificationCron(new Date())).rejects.toThrow("permission denied");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("結果に skippedLockedCount が無ければ読み取りエラーにする", async () => {
    const withoutSkipped: Partial<typeof CRON_RESULT> = { ...CRON_RESULT };
    delete withoutSkipped.skippedLockedCount;
    rpc.mockResolvedValueOnce({ data: withoutSkipped, error: null });
    const { runVerificationCron } = await import("./mutations");
    await expect(runVerificationCron(new Date())).rejects.toThrow("読み取れませんでした");
  });
});
