// 日次 cron（/api/cron/verification）の最後に、保存期間を過ぎたお問い合わせを削除する（SPEC §9.17）。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { purgeExpiredAccountDeletionLog } from "@/lib/db/account-deletion";
import { purgeExpiredContactData } from "@/lib/db/contact";
import { runVerificationCron } from "@/lib/db/mutations";
import { GET } from "./route";

vi.mock("@/lib/db/mutations", () => ({ runVerificationCron: vi.fn() }));
vi.mock("@/lib/db/contact", () => ({ purgeExpiredContactData: vi.fn() }));
vi.mock("@/lib/db/account-deletion", () => ({ purgeExpiredAccountDeletionLog: vi.fn() }));

const SECRET = "cron-secret-for-route-test-0123456789abcdef";
const CRON_RESULT = { checked: 1, changed: 0, missedRequestCount: 0, createdRequestCount: 0, skippedLockedCount: 0 };

function request(authorization?: string): Request {
  return new Request("http://localhost/api/cron/verification", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.mocked(runVerificationCron).mockResolvedValue(CRON_RESULT);
  vi.mocked(purgeExpiredContactData).mockResolvedValue({ deletedMessages: 2, deletedRates: 5 });
  vi.mocked(purgeExpiredAccountDeletionLog).mockResolvedValue({ deletedLogs: 3 });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/cron/verification", () => {
  it("確認の定期処理のあとに、保存期間を過ぎたお問い合わせを削除する", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ...CRON_RESULT,
      contactPurge: { deletedMessages: 2, deletedRates: 5 },
      accountDeletionLogPurge: { deletedLogs: 3 },
    });
    expect(purgeExpiredContactData).toHaveBeenCalledTimes(1);
    const cronOrder = vi.mocked(runVerificationCron).mock.invocationCallOrder[0] ?? 0;
    const purgeOrder = vi.mocked(purgeExpiredContactData).mock.invocationCallOrder[0] ?? 0;
    expect(purgeOrder).toBeGreaterThan(cronOrder);
  });

  it("公開デモ（URASUPO_PUBLIC_DEMO=1）では、認可があっても何もせず 404", async () => {
    vi.stubEnv("URASUPO_PUBLIC_DEMO", "1");
    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(404);
    expect(runVerificationCron).not.toHaveBeenCalled();
    expect(purgeExpiredContactData).not.toHaveBeenCalled();
    expect(purgeExpiredAccountDeletionLog).not.toHaveBeenCalled();
  });

  it("認可が無ければ何もしない（削除もしない）", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(runVerificationCron).not.toHaveBeenCalled();
    expect(purgeExpiredContactData).not.toHaveBeenCalled();
    expect(purgeExpiredAccountDeletionLog).not.toHaveBeenCalled();
  });

  it("削除に失敗したら記録して500を返す（確認の定期処理の結果は返す）", async () => {
    vi.mocked(purgeExpiredContactData).mockRejectedValueOnce(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject(CRON_RESULT);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("最後に、30日を過ぎた退会の記録を削除する（R22 決定事項、SPEC §9.17）", async () => {
    await GET(request(`Bearer ${SECRET}`));
    expect(purgeExpiredAccountDeletionLog).toHaveBeenCalledTimes(1);
    const contactOrder = vi.mocked(purgeExpiredContactData).mock.invocationCallOrder[0] ?? 0;
    const logOrder = vi.mocked(purgeExpiredAccountDeletionLog).mock.invocationCallOrder[0] ?? 0;
    expect(logOrder).toBeGreaterThan(contactOrder);
  });

  it("問い合わせの削除に失敗しても、退会の記録の削除は行う（500 を返す）", async () => {
    vi.mocked(purgeExpiredContactData).mockRejectedValueOnce(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ accountDeletionLogPurge: { deletedLogs: 3 } });
    expect(purgeExpiredAccountDeletionLog).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });

  it("退会の記録の削除に失敗したら記録して500を返す（ほかの結果は返す）", async () => {
    vi.mocked(purgeExpiredAccountDeletionLog).mockRejectedValueOnce(new Error("db down"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(request(`Bearer ${SECRET}`));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      ...CRON_RESULT,
      contactPurge: { deletedMessages: 2, deletedRates: 5 },
      accountDeletionLogPurge: { error: "failed" },
    });
    expect(errorSpy).toHaveBeenCalledTimes(1);
    errorSpy.mockRestore();
  });
});
