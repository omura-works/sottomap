import { describe, expect, it } from "vitest";
import { summarizeCspReport } from "./logic";

describe("summarizeCspReport（CSP違反レポートの要点抽出）", () => {
  // Codex R17 重要2: Unicode の行区切りと双方向制御文字（U+061C を含む）も取り除く。
  it("Unicodeの行区切り・双方向制御文字（U+061C を含む）も空白に置き換える", () => {
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/sapporo",
        "effective-directive": "script-src\u2028\u061c\u202e偽装",
        "blocked-uri": "https://evil.example/x.js",
      },
    };
    const summary = summarizeCspReport(body);
    expect(summary?.effectiveDirective).toBe("script-src   偽装");
  });

  // Codex R16 軽微1: 200文字で切るときに絵文字を割らない。
  it("200文字を超える値は文字単位で切り、絵文字を壊さない", () => {
    const long = "a".repeat(199) + "🍜" + "b".repeat(10);
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/sapporo",
        "effective-directive": long,
        "blocked-uri": "https://evil.example/x.js",
      },
    };
    const value = summarizeCspReport(body)?.effectiveDirective ?? "";
    expect([...value]).toHaveLength(200);
    expect(value.endsWith("🍜")).toBe(true);
  });

  // Codex R15 重要2: 認証不要の受信口なので、改行や制御文字をそのままログへ通さない。
  it("改行や制御文字を含む値は空白に置き換えて返す（ログ注入を防ぐ）", () => {
    const body = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/sapporo",
        "effective-directive": "script-src\n[csp-report] 偽のログ行",
        "blocked-uri": "not-a-url\r\n偽の内訳",
      },
    };
    const summary = summarizeCspReport(body);
    expect(summary?.effectiveDirective).not.toMatch(/[\r\n]/);
    expect(summary?.blockedUriOrigin).not.toMatch(/[\r\n]/);
    expect(summary?.effectiveDirective).toBe("script-src [csp-report] 偽のログ行");
  });

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
