// CSP 違反レポート（本番公開前指示書 R13-B §1）の要点抽出。
//
// ブラウザが `report-uri` に送る本文は Chromium 系・Firefox 系ともおおむね
// `{ "csp-report": { "document-uri", "blocked-uri", "effective-directive", ... } }`
// （古い CSP3 report-uri 形式）。将来 `report-to`（Reporting API）を使う場合は
// `[{ "type": "csp-violation", "body": { "documentURL", "blockedURL", "effectiveDirective", ... } }]`
// という配列形式になるため、両方から同じ要約を取り出せるようにする。
//
// 個人情報・機微情報を残さないため、URL はオリジン/パスだけを取り出し、クエリ文字列は捨てる。
// さらに各項目は200文字で切って残す（想定外に長い値・過大なログを防ぐ）。

export interface CspReportSummary {
  effectiveDirective: string;
  /** blocked-uri のオリジン（`inline` 等のキーワードや解析できない値はそのまま）。クエリ文字列は含めない。 */
  blockedUriOrigin: string;
  /** document-uri のパスのみ（オリジン・クエリ文字列は含めない）。 */
  documentUriPath: string;
}

/** URL らしき文字列からオリジンだけを取り出す。パースできなければキーワードとしてそのまま返す。 */
function originOf(value: unknown): string {
  if (typeof value !== "string" || value === "") return "unknown";
  try {
    return truncate(new URL(value).origin);
  } catch {
    // "inline" "eval" "self" 等のキーワードや不完全なスキームはそのまま返す（クエリ文字列を含まない前提）。
    return truncate(value.split("?")[0]);
  }
}

/** URL らしき文字列からパスだけを取り出す（クエリ文字列・フラグメントは捨てる）。 */
function pathOf(value: unknown): string {
  if (typeof value !== "string" || value === "") return "unknown";
  try {
    return truncate(new URL(value).pathname);
  } catch {
    return truncate(value.split("?")[0]);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** ログに残す各項目の上限文字数。ブラウザが送る値は通常もっと短いが、想定外に長い値を切って残す。 */
const MAX_FIELD_LENGTH = 200;

/**
 * 文字列を200文字で切り、制御文字（改行・タブ・エスケープ等）を取り除く。
 * Codex R15 重要2: この受信口は認証不要なので、改行入りの値をそのままログに出すと
 * 偽のログ行を差し込める（ログ注入）。切り詰めと同時に必ず取り除く。
 */
function truncate(value: string): string {
  // eslint-disable-next-line no-control-regex
  const sanitized = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ");
  return sanitized.length > MAX_FIELD_LENGTH ? sanitized.slice(0, MAX_FIELD_LENGTH) : sanitized;
}

/** 古い report-uri 形式（`{ "csp-report": {...} }`）から要約を取り出す。 */
function fromCspReportUri(report: Record<string, unknown>): CspReportSummary | null {
  const inner = report["csp-report"];
  if (!isRecord(inner)) return null;
  const effectiveDirective = inner["effective-directive"];
  return {
    effectiveDirective:
      typeof effectiveDirective === "string" && effectiveDirective ? truncate(effectiveDirective) : "unknown",
    blockedUriOrigin: originOf(inner["blocked-uri"]),
    documentUriPath: pathOf(inner["document-uri"]),
  };
}

/** Reporting API 形式（`{ "type": "csp-violation", "body": {...} }`）から要約を取り出す。 */
function fromReportingApi(report: Record<string, unknown>): CspReportSummary | null {
  if (report["type"] !== "csp-violation") return null;
  const body = report["body"];
  if (!isRecord(body)) return null;
  const effectiveDirective = body["effectiveDirective"];
  return {
    effectiveDirective:
      typeof effectiveDirective === "string" && effectiveDirective ? truncate(effectiveDirective) : "unknown",
    blockedUriOrigin: originOf(body["blockedURL"]),
    documentUriPath: pathOf(body["documentURL"]),
  };
}

/**
 * リクエスト本文（JSON.parse 済み）から CSP 違反の要点を抜き出す。
 * 想定外の形（配列でも csp-report でも report-to でもない）なら null。
 */
export function summarizeCspReport(parsedBody: unknown): CspReportSummary | null {
  if (Array.isArray(parsedBody)) {
    for (const item of parsedBody) {
      if (isRecord(item)) {
        const summary = fromReportingApi(item);
        if (summary) return summary;
      }
    }
    return null;
  }
  if (isRecord(parsedBody)) {
    return fromCspReportUri(parsedBody) ?? fromReportingApi(parsedBody);
  }
  return null;
}
