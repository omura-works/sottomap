import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST, resetCspReportLimiterForTests } from "./route";

function postCspReport(payload: unknown) {
  const request = new Request("https://urasupo.jp/api/csp-report", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return POST(request);
}

describe("POST /api/csp-report", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resetCspReportLimiterForTests();
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("正常な csp-report 本文を受理し204を返し、要点だけをconsole.warnに出す", async () => {
    const payload = {
      "csp-report": {
        "document-uri": "https://urasupo.jp/sapporo?ref=abc",
        "effective-directive": "script-src",
        "blocked-uri": "https://evil.example/x.js?y=1",
      },
    };
    const request = new Request("https://urasupo.jp/api/csp-report", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0]?.join(" ") ?? "";
    expect(logged).toContain("script-src");
    expect(logged).toContain("https://evil.example");
    expect(logged).not.toContain("ref=abc");
    expect(logged).not.toContain("y=1");
  });

  it("本文が無くても204を返す", async () => {
    const request = new Request("https://urasupo.jp/api/csp-report", { method: "POST", body: "" });
    const response = await POST(request);
    expect(response.status).toBe(204);
  });

  it("JSON として解析できない本文でも204を返し、落ちない", async () => {
    const request = new Request("https://urasupo.jp/api/csp-report", { method: "POST", body: "not json" });
    const response = await POST(request);
    expect(response.status).toBe(204);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("content-length が上限（16KB）を超える本文は413で拒否する", async () => {
    const request = new Request("https://urasupo.jp/api/csp-report", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(20 * 1024) },
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("content-length ヘッダーが無くても実際の本文が上限を超えていれば413で拒否する", async () => {
    const bigBody = JSON.stringify({ "csp-report": { "document-uri": "x".repeat(20 * 1024) } });
    const request = new Request("https://urasupo.jp/api/csp-report", { method: "POST", body: bigBody });
    const response = await POST(request);
    expect(response.status).toBe(413);
  });

  it("content-length が無く、ストリームで少しずつ送られてきても、上限を超えた時点で読み込みを打ち切り413で拒否する（全部読み切らない）", async () => {
    let pulledChunks = 0;
    const chunkSize = 4 * 1024;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulledChunks += 1;
        // 上限（16KB）を大きく超える量を、少しずつ送り続けるふりをする。
        if (pulledChunks > 100) {
          controller.close();
          return;
        }
        controller.enqueue(new TextEncoder().encode("x".repeat(chunkSize)));
      },
    });
    const request = new Request("https://urasupo.jp/api/csp-report", {
      method: "POST",
      body: stream,
      // Node の fetch 実装が Content-Length を要求するため duplex を明示する。
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    const response = await POST(request);
    expect(response.status).toBe(413);
    // 上限（16KB = chunkSize の4個分）を超えた直後に打ち切るため、全100チャンクは読み切っていない。
    expect(pulledChunks).toBeLessThan(100);
  });

  it("上限（60秒あたり20件）を超えたら、以降は本文を読まずに204を返しログも増やさない（R14 重要3）", async () => {
    const payload = {
      "csp-report": { "document-uri": "https://urasupo.jp/sapporo", "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js" },
    };
    for (let i = 0; i < 20; i += 1) {
      const response = await postCspReport(payload);
      expect(response.status).toBe(204);
    }
    expect(warnSpy).toHaveBeenCalledTimes(1); // 同じ違反は重複排除で1回だけログに出る

    warnSpy.mockClear();
    // 21件目以降（上限超え）は本文を読まず、ログも増やさない
    const overLimit = await postCspReport({
      "csp-report": { "document-uri": "https://urasupo.jp/x", "effective-directive": "style-src", "blocked-uri": "https://another.example/y.css" },
    });
    expect(overLimit.status).toBe(204);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("同じ違反（effective-directive と blocked-uri のオリジンの組）が続くと、重複はログに出さずまとめる", async () => {
    const payload = {
      "csp-report": { "document-uri": "https://urasupo.jp/sapporo", "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js" },
    };
    await postCspReport(payload);
    await postCspReport(payload);
    await postCspReport(payload);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls[0]?.join(" ") ?? "";
    expect(logged).toContain("script-src");
  });

  it("異なる違反はそれぞれ最初の1回はログに出る", async () => {
    await postCspReport({
      "csp-report": { "document-uri": "https://urasupo.jp/a", "effective-directive": "script-src", "blocked-uri": "https://evil.example/x.js" },
    });
    await postCspReport({
      "csp-report": { "document-uri": "https://urasupo.jp/b", "effective-directive": "style-src", "blocked-uri": "https://other.example/y.css" },
    });

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe("GET /api/csp-report", () => {
  it("405を返す（レポート受信専用）", () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
