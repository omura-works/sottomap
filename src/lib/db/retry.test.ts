import { describe, expect, it, vi } from "vitest";
import { callWithSingleTransactionRetry, isRetryableTransactionError } from "./retry";

type Result = { data: string | null; error: { code?: string | null; message: string } | null };

function ok(data: string): Result {
  return { data, error: null };
}

function fail(code: string | null): Result {
  return { data: null, error: { code, message: `error ${code ?? "none"}` } };
}

describe("isRetryableTransactionError（Spec §9.13.8）", () => {
  it("40P01（デッドロック）と 40001（直列化失敗）だけを再実行の対象にする", () => {
    expect(isRetryableTransactionError(fail("40P01").error)).toBe(true);
    expect(isRetryableTransactionError(fail("40001").error)).toBe(true);
    expect(isRetryableTransactionError(fail("42501").error)).toBe(false);
    expect(isRetryableTransactionError(fail("55P03").error)).toBe(false);
    expect(isRetryableTransactionError(fail(null).error)).toBe(false);
    expect(isRetryableTransactionError(null)).toBe(false);
  });
});

describe("callWithSingleTransactionRetry", () => {
  it("成功したら再実行しない", async () => {
    const call = vi.fn(async () => ok("done"));
    await expect(callWithSingleTransactionRetry(call)).resolves.toEqual(ok("done"));
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("40P01 のときは1回だけ再実行し、その結果を返す", async () => {
    const call = vi.fn<() => Promise<Result>>().mockResolvedValueOnce(fail("40P01")).mockResolvedValueOnce(ok("retried"));
    await expect(callWithSingleTransactionRetry(call)).resolves.toEqual(ok("retried"));
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("40001 のときも1回だけ再実行する", async () => {
    const call = vi.fn<() => Promise<Result>>().mockResolvedValueOnce(fail("40001")).mockResolvedValueOnce(ok("retried"));
    await expect(callWithSingleTransactionRetry(call)).resolves.toEqual(ok("retried"));
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("再実行も 40P01 なら、それ以上は再実行せずエラーを返す", async () => {
    const call = vi.fn(async () => fail("40P01"));
    await expect(callWithSingleTransactionRetry(call)).resolves.toEqual(fail("40P01"));
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("それ以外のエラー（権限・タイムアウト・コードなし）は再実行しない", async () => {
    for (const code of ["42501", "57014", "P0001", null]) {
      const call = vi.fn(async () => fail(code));
      await expect(callWithSingleTransactionRetry(call)).resolves.toEqual(fail(code));
      expect(call).toHaveBeenCalledTimes(1);
    }
  });
});
