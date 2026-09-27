// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadOgFont, OG_FONT_NAME } from "./_og/og-font";

/** TrueType の cmap（format 4 / 12）から、その文字の字形番号を引く（0 = 字形なし＝□になる）。 */
function glyphIndex(font: ArrayBuffer, codePoint: number): number {
  const view = new DataView(font);
  const numTables = view.getUint16(4);
  let cmap = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    const tag = String.fromCharCode(view.getUint8(rec), view.getUint8(rec + 1), view.getUint8(rec + 2), view.getUint8(rec + 3));
    if (tag === "cmap") cmap = view.getUint32(rec + 8);
  }
  if (cmap < 0) return 0;
  const count = view.getUint16(cmap + 2);
  for (let i = 0; i < count; i++) {
    const sub = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    const format = view.getUint16(sub);
    if (format === 12) {
      const groups = view.getUint32(sub + 12);
      for (let g = 0; g < groups; g++) {
        const at = sub + 16 + g * 12;
        const start = view.getUint32(at);
        const end = view.getUint32(at + 4);
        if (codePoint >= start && codePoint <= end) return view.getUint32(at + 8) + (codePoint - start);
      }
    }
  }
  for (let i = 0; i < count; i++) {
    const sub = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    if (view.getUint16(sub) !== 4 || codePoint > 0xffff) continue;
    const segX2 = view.getUint16(sub + 6);
    const ends = sub + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const offsets = deltas + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = view.getUint16(ends + s * 2);
      const start = view.getUint16(starts + s * 2);
      if (codePoint < start || codePoint > end) continue;
      const delta = view.getInt16(deltas + s * 2);
      const offset = view.getUint16(offsets + s * 2);
      if (offset === 0) return (codePoint + delta) & 0xffff;
      const glyph = view.getUint16(offsets + s * 2 + offset + (codePoint - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
  }
  return 0;
}

const { captured } = vi.hoisted(() => ({ captured: [] as { fonts?: { name: string; data: ArrayBuffer }[] }[] }));
vi.mock("next/og", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/og")>();
  class CapturingImageResponse extends actual.ImageResponse {
    constructor(...args: ConstructorParameters<typeof actual.ImageResponse>) {
      super(...args);
      captured.push(args[1] as { fonts?: { name: string; data: ArrayBuffer }[] });
    }
  }
  return { ...actual, ImageResponse: CapturingImageResponse };
});

describe("OG 画像（Codex R27 重要: ネットワーク不通でも日本語が描ける）", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    captured.length = 0;
  });

  it("同梱のフォントに、OG 画像で使う日本語すべての字形がある", async () => {
    const font = await loadOgFont();
    expect(font.name).toBe(OG_FONT_NAME);
    const missing = [..."そっとマップ北海道の、まだ静かな店を歩く"].filter((ch) => glyphIndex(font.data, ch.codePointAt(0) ?? 0) === 0);
    expect(missing).toEqual([]);
  });

  it("fetch が失敗しても、同梱フォントを渡して PNG を作る（ネットワークに取りに行かない）", async () => {
    // ネットワーク（http/https）だけを不通にする。next/og は自分の wasm を data: URL の fetch で読むため、それは通す
    const realFetch = globalThis.fetch;
    const networkUrls: string[] = [];
    vi.stubGlobal("fetch", (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/^https?:/i.test(url)) {
        networkUrls.push(url);
        return Promise.reject(new Error("offline"));
      }
      return realFetch(input, init);
    });
    const { default: OpengraphImage } = await import("./opengraph-image");

    const response = await OpengraphImage();
    const png = new Uint8Array(await response.arrayBuffer());

    expect(networkUrls).toEqual([]);
    expect(captured[0]?.fonts?.[0]?.name).toBe(OG_FONT_NAME);
    expect(captured[0]?.fonts?.[0]?.data.byteLength).toBeGreaterThan(1_000_000);
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // 日本語が□だけになった画像は 3,905 byte だった（R27 の再現）。字形が描けていればずっと大きい
    expect(png.byteLength).toBeGreaterThan(20_000);
  }, 60_000);
});
