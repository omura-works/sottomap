import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFER_BELOW_ATTRIBUTE, DEFER_BELOW_SCRIPT } from "./defer-below";

afterEach(() => {
  document.documentElement.removeAttribute(DEFER_BELOW_ATTRIBUTE);
  vi.useRealTimers();
});

describe("画面の外の節を最初の描画の直後に描くインラインスクリプト（SPEC motion §7.1）", () => {
  it("動いた瞬間に <html> へ印を付け、描画のフレームが進んだら外す（React と無関係に動く）", async () => {
    new Function(DEFER_BELOW_SCRIPT)();
    expect(document.documentElement.hasAttribute(DEFER_BELOW_ATTRIBUTE)).toBe(true);
    // jsdom には描画の計測（paint）が無いので、フレームを2つ待って外す側に倒れる
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));
    expect(document.documentElement.hasAttribute(DEFER_BELOW_ATTRIBUTE)).toBe(false);
  });

  it("保険のタイマーは 1500ms", () => {
    expect(DEFER_BELOW_SCRIPT).toContain("setTimeout(show,1500)");
  });
});
