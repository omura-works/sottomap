import { describe, expect, it } from "vitest";
import { hash32, tiltFromId } from "./tilt";

describe("tiltFromId", () => {
  it("同じ id なら同じ角度（乱数を使わない）", () => {
    const id = "d0000000-0000-4000-8000-000000000001";
    expect(tiltFromId(id, 4)).toBe(tiltFromId(id, 4));
    expect(hash32(id)).toBe(hash32(id));
  });

  it("-max..max の整数に収まる", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const tilt = tiltFromId(`spot-${i}`, 4);
      expect(Number.isInteger(tilt)).toBe(true);
      expect(tilt).toBeGreaterThanOrEqual(-4);
      expect(tilt).toBeLessThanOrEqual(4);
      seen.add(tilt);
    }
    // 偏らず、両端まで出る
    expect(seen.has(-4)).toBe(true);
    expect(seen.has(4)).toBe(true);
  });

  it("hash32 は符号なし 32bit（FNV-1a）", () => {
    expect(hash32("")).toBe(0x811c9dc5);
    expect(hash32("a")).toBe(0xe40c292c);
  });
});
