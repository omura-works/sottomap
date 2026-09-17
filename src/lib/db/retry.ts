// DB 関数（RPC）の限定的な再実行（Spec §9.13.8）。
//
// run_verification_cron は回答・承認と同時に走っても交差デッドロックしない作りだが、
// PostgreSQL がデッドロック（40P01）や直列化失敗（40001）でトランザクションを中断した場合に限り、
// cron の API は1回だけ再実行する。それ以外のエラーは再実行しない（そのまま呼び出し側へ返す）。

/** 再実行してよい PostgreSQL のエラーコード（deadlock_detected / serialization_failure）。 */
export const RETRYABLE_TRANSACTION_ERROR_CODES: ReadonlySet<string> = new Set(["40P01", "40001"]);

/** supabase-js の rpc() が返す形のうち、判定に使う部分。 */
export interface RpcResultLike {
  error: { code?: string | null; message: string } | null;
}

export function isRetryableTransactionError(error: RpcResultLike["error"]): boolean {
  return typeof error?.code === "string" && RETRYABLE_TRANSACTION_ERROR_CODES.has(error.code);
}

/**
 * call を実行し、結果のエラーコードが 40P01 / 40001 のときだけ1回だけ再実行する。
 * 再実行の結果は（成功でも失敗でも）そのまま返す。
 */
export async function callWithSingleTransactionRetry<R extends RpcResultLike>(
  call: () => PromiseLike<R>,
): Promise<R> {
  const first = await call();
  if (!isRetryableTransactionError(first.error)) return first;
  return await call();
}
