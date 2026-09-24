import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";

let mockPathname = "/sapporo";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? matches : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

const LABEL_LEFT: Record<string, number> = { 地図: 20, さがす: 110, 栞: 210, 自分: 300 };

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

const animateSpy = vi.fn();

beforeEach(() => {
  animateSpy.mockReset();
  // jsdom は Web Animations API を持たないため、呼び出しだけを記録する。
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, writable: true, value: animateSpy });
  // 文字（span）には位置と幅を与える（jsdom は常に 0 を返すため）。
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const left = LABEL_LEFT[this.textContent ?? ""];
    if (this.tagName === "SPAN" && left !== undefined) return rect(left, 10, 30, 14);
    return rect(0, 0, 400, 60);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

describe("タブインジケーター（下部タブ）", () => {
  it("選択中のタブの文字の下に置き、aria-hidden。aria-current はそのまま", () => {
    mockReducedMotion(false);
    mockPathname = "/sapporo";
    render(<BottomNav />);
    const indicator = screen.getByTestId("tab-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
    expect(indicator.style.opacity).toBe("1");
    expect(indicator.style.transform).toBe("translate(20px, 27px) scaleX(0.3)");
    expect(screen.getByRole("link", { name: "地図" })).toHaveAttribute("aria-current", "page");
    // 初回は置くだけで動かさない。
    expect(animateSpy).not.toHaveBeenCalled();
  });

  it("タブを移ると、移動先の方向へ伸びてから移動先の文字幅に縮む（520ms）", () => {
    mockReducedMotion(false);
    mockPathname = "/sapporo";
    const { rerender } = render(<BottomNav />);
    mockPathname = "/bookmarks";
    rerender(<BottomNav />);
    expect(animateSpy).toHaveBeenCalledTimes(1);
    const [keyframes, options] = animateSpy.mock.calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(options.duration).toBe(520);
    expect(keyframes.map((frame) => frame.transform)).toEqual([
      "translate(20px, 27px) scaleX(0.3)",
      // 地図の左端（20）から栞の右端（240）まで伸びる。
      "translate(20px, 27px) scaleX(2.2)",
      "translate(210px, 27px) scaleX(0.3)",
    ]);
    expect(screen.getByTestId("tab-indicator").style.transform).toBe("translate(210px, 27px) scaleX(0.3)");
  });

  it("reduced-motion のときは動かさず、移動先に置くだけ", () => {
    mockReducedMotion(true);
    mockPathname = "/sapporo";
    const { rerender } = render(<BottomNav />);
    mockPathname = "/bookmarks";
    rerender(<BottomNav />);
    expect(animateSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId("tab-indicator").style.transform).toBe("translate(210px, 27px) scaleX(0.3)");
  });

  it("選択中のタブが無いページでは線を隠す", () => {
    mockReducedMotion(false);
    mockPathname = "/";
    render(<BottomNav />);
    expect(screen.getByTestId("tab-indicator").style.opacity).toBe("0");
  });
});

describe("タブインジケーター（デスクトップのサイドレール）", () => {
  it("同じ方針で縦線を置き、項目を移ると動く", () => {
    mockReducedMotion(false);
    mockPathname = "/sapporo";
    const { rerender } = render(<SideRail />);
    const indicator = screen.getByTestId("tab-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
    expect(indicator).toHaveAttribute("data-axis", "y");
    expect(indicator.style.opacity).toBe("1");
    mockPathname = "/me";
    rerender(<SideRail />);
    expect(animateSpy).toHaveBeenCalledTimes(1);
  });
});
