import { NextResponse } from "next/server";
import { summarizeCspReport } from "./logic";

export const dynamic = "force-dynamic";

// 本文サイズ上限（本番公開前指示書 R13-B §1）。ブラウザが送るCSP違反レポートは通常数百バイトで、
// 16KBを超える入力は想定外（DoS・誤送信）として受理しない。
const MAX_BODY_BYTES = 16 * 1024;

/**
 * CSP 違反レポート受信（`Content-Security-Policy-Report-Only` の `report-uri`）。
 * 違反の要点（effective-directive・blocked-uri のオリジン・document-uri のパス）だけを
 * `console.warn` で構造化ログに出し、常に 204 を返す（利用者側に失敗を見せない）。
 * クエリ文字列や本文全体など、個人情報になり得る詳細は出さない。
 */
export async function POST(request: Request): Promise<NextResponse> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  if (rawBody) {
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      const summary = summarizeCspReport(parsed);
      if (summary) {
        console.warn(
          "[csp-report]",
          JSON.stringify({
            effectiveDirective: summary.effectiveDirective,
            blockedUriOrigin: summary.blockedUriOrigin,
            documentUriPath: summary.documentUriPath,
          }),
        );
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
