import { NextResponse } from "next/server";
import { summarizeCspReport } from "./logic";
import { checkRateLimit, createCspLimiterState, recordViolation } from "./rate-limit";

export const dynamic = "force-dynamic";

// 本文サイズ上限（本番公開前指示書 R13-B §1）。ブラウザが送るCSP違反レポートは通常数百バイトで、
// 16KBを超える入力は想定外（DoS・誤送信）として受理しない。
const MAX_BODY_BYTES = 16 * 1024;

// レート制限・重複排除・要約ログの状態（R14 重要3）。同一プロセス内で共有し、リクエストをまたいで
// 保持する（このプロセス／関数実行環境が終了すれば消える。サーバーレスでは複数インスタンスに
// 分散されることがあり、その場合はインスタンス単位にしか制限がかからない点に注意。docs/DEPLOY.md 8節）。
let limiterState = createCspLimiterState(Date.now());

/** テスト専用: プロセス内の状態をリセットする（本番コードから呼ばない）。 */
export function resetCspReportLimiterForTests(): void {
  limiterState = createCspLimiterState(Date.now());
}

/**
 * リクエストボディを読みながら、上限（`MAX_BODY_BYTES`）を超えた時点で読み込みを打ち切る。
 * `content-length` ヘッダーが無い・信用できない場合でも、ストリームを最後まで読み切る前に
 * メモリに載る量を上限で止めるための実装（ヘッダーのチェックだけでは、ヘッダーを付けずに
 * 大量のボディを送るクライアントを止められない）。
 * 上限超えなら null（413を返す）、上限内ならデコード済みの文字列を返す（空文字列も含む）。
 */
async function readBodyWithLimit(request: Request, limitBytes: number): Promise<string | null> {
  const body = request.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limitBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

/**
 * CSP 違反レポート受信（`Content-Security-Policy-Report-Only` の `report-uri`）。
 * 違反の要点（effective-directive・blocked-uri のオリジン・document-uri のパス）だけを
 * `console.warn` で構造化ログに出し、常に 204 を返す（利用者側に失敗を見せない）。
 * クエリ文字列や本文全体など、個人情報になり得る詳細は出さない。
 *
 * 濫用対策（R14 重要3）: 認証は不要のままだが、次を行う。
 *   - レート制限（60秒あたり最大20件）。超えたら本文を読まずに204で終える。
 *   - 重複排除（effective-directive とblocked-uriのオリジンの組が鍵。時間枠内の同じ違反は
 *     ログに出さず件数だけ数える）。
 *   - 一定間隔で「直近◯秒でN件、内訳」の要約を1行ログに出す。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const now = Date.now();
  if (!checkRateLimit(limiterState, now)) {
    // 上限超え: 本文を読まず（ログも増やさず）に204で終える。
    return new NextResponse(null, { status: 204 });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  // content-length が無い（または信用できない）場合でも、読み込みながら上限を超えた時点で打ち切る。
  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return new NextResponse(null, { status: 413 });
  }

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      const summary = summarizeCspReport(parsed);
      if (summary) {
        const key = `${summary.effectiveDirective}|${summary.blockedUriOrigin}`;
        const decision = recordViolation(limiterState, key, now);
        if (decision.shouldLog) {
          console.warn(
            "[csp-report]",
            JSON.stringify({
              effectiveDirective: summary.effectiveDirective,
              blockedUriOrigin: summary.blockedUriOrigin,
              documentUriPath: summary.documentUriPath,
            }),
          );
        }
        if (decision.summary) {
          console.warn("[csp-report-summary]", JSON.stringify(decision.summary));
        }
      } else {
        console.warn("[csp-report] 予期しない形式の本文を受信しました。");
      }
    } catch {
      console.warn("[csp-report] JSON として解析できない本文を受信しました。");
    }
  }

  // レポート送信元（ブラウザ）に情報を返す必要はない。204で終える。
  return new NextResponse(null, { status: 204 });
}

/** レポート受信専用のエンドポイントのため GET は許可しない。 */
export function GET(): NextResponse {
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
