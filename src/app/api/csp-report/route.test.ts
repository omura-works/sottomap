import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

describe("POST /api/csp-report", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
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
});

describe("GET /api/csp-report", () => {
  it("405を返す（レポート受信専用）", () => {
    const response = GET();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });
});
