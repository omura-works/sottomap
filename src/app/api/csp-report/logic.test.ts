import { describe, expect, it } from "vitest";
import { summarizeCspReport } from "./logic";

describe("summarizeCspReport（CSP違反レポートの要点抽出）", () => {
  it("report-uri 形式（csp-report）から effective-directive・blocked-uri のオリジン・document-uri のパスを取り出す", () => {
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/sapporo?ref=abc",
        referrer: "",
        "violated-directive": "script-src",
        "effective-directive": "script-src",
        "blocked-uri": "https://evil.example/x.js",
        "original-policy": "default-src 'self'",
      },
    };
    expect(summarizeCspReport(body)).toEqual({
      effectiveDirective: "script-src",
      blockedUriOrigin: "https://evil.example",
      documentUriPath: "/sapporo",
    });
  });

  it("クエリ文字列を含めない（document-uri・blocked-uri のどちらも）", () => {
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/me?token=secret",
        "effective-directive": "img-src",
        "blocked-uri": "https://tracker.example/pixel?uid=123",
      },
    };
    const summary = summarizeCspReport(body);
    expect(summary?.documentUriPath).toBe("/me");
    expect(summary?.blockedUriOrigin).toBe("https://tracker.example");
  });

  it("blocked-uri がキーワード（inline 等）でもクラッシュせずそのまま返す", () => {
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/start",
        "effective-directive": "style-src",
        "blocked-uri": "inline",
      },
    };
    expect(summarizeCspReport(body)?.blockedUriOrigin).toBe("inline");
  });

  it("Reporting API 形式（type: csp-violation）からも取り出せる", () => {
    const body = [
      {
        type: "csp-violation",
        body: {
          documentURL: "https://urasupo.jp/sapporo/search?q=x",
          effectiveDirective: "connect-src",
          blockedURL: "https://api.example/",
        },
      },
    ];
    expect(summarizeCspReport(body)).toEqual({
      effectiveDirective: "connect-src",
      blockedUriOrigin: "https://api.example",
      documentUriPath: "/sapporo/search",
    });
  });

  it("各項目は200文字で切って残す（URLとして解析できない過大な値でもクラッシュしない）", () => {
    const longKeyword = "x".repeat(500);
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/start",
        "effective-directive": longKeyword,
        "blocked-uri": longKeyword,
      },
    };
    const summary = summarizeCspReport(body);
    expect(summary?.effectiveDirective).toHaveLength(200);
    expect(summary?.blockedUriOrigin).toHaveLength(200);
    expect(summary?.effectiveDirective).toBe(longKeyword.slice(0, 200));
    expect(summary?.blockedUriOrigin).toBe(longKeyword.slice(0, 200));
  });

  it("URLとして解析できる過大な値も200文字で切る（オリジン自体が長い場合）", () => {
    const longHost = "a".repeat(300) + ".example";
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/start",
        "effective-directive": "img-src",
        "blocked-uri": `https://${longHost}/x.js`,
      },
    };
    const summary = summarizeCspReport(body);
    expect(summary?.blockedUriOrigin.length).toBeLessThanOrEqual(200);
  });

  it("想定外の形式は null", () => {
    expect(summarizeCspReport({ foo: "bar" })).toBeNull();
    expect(summarizeCspReport([{ type: "not-csp" }])).toBeNull();
    expect(summarizeCspReport("hello")).toBeNull();
    expect(summarizeCspReport(null)).toBeNull();
  });
});
