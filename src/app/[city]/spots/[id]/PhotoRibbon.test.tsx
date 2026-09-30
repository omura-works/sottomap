import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockReducedMotion } from "@/components/motion/test-utils";
import { PhotoRibbon } from "./PhotoRibbon";

function emit(name: string, spotId: string) {
  act(() => {
    window.dispatchEvent(new CustomEvent(name, { detail: { spotId } }));
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PhotoRibbon（写真の栞のリボン。SPEC motion §5.4）", () => {
  it("挟んでいないときは出さず、この店の sotto:bookmarked で上から挟まる（飾りなので aria-hidden）", () => {
    mockReducedMotion(false);
    const { container } = render(<PhotoRibbon spotId="a" initiallyBookmarked={false} />);
    expect(container.querySelector(".photo-ribbon")).toBeNull();
    emit("sotto:bookmarked", "other");
    expect(container.querySelector(".photo-ribbon")).toBeNull();
    emit("sotto:bookmarked", "a");
    const ribbon = container.querySelector(".photo-ribbon");
    expect(ribbon).toHaveClass("verb-tuck");
    expect(container.querySelector(".photo-rb-box")).toHaveAttribute("aria-hidden", "true");
  });

  it("最初から挟んでいれば挟まった状態で出て、失敗すると上へ抜けてから消える", () => {
    mockReducedMotion(false);
    const { container } = render(<PhotoRibbon spotId="a" initiallyBookmarked />);
    const ribbon = container.querySelector(".photo-ribbon")!;
    expect(ribbon).not.toHaveClass("verb-tuck");
    emit("sotto:bookmark-failed", "a");
    expect(container.querySelector(".photo-ribbon")).toHaveClass("is-leaving");
    // jsdom には AnimationEvent が無く、React は接頭辞つきの名前でも聞くので両方出す
    for (const type of ["animationend", "webkitAnimationEnd"]) {
      const end = new Event(type, { bubbles: true });
      Object.defineProperty(end, "animationName", { value: "photo-ribbon-out" });
      act(() => {
        fireEvent(container.querySelector(".photo-ribbon") ?? document.body, end);
      });
    }
    expect(container.querySelector(".photo-ribbon")).toBeNull();
  });

  it("reduce では動かさず、すぐに出入りする", () => {
    mockReducedMotion(true);
    const { container } = render(<PhotoRibbon spotId="a" initiallyBookmarked={false} />);
    emit("sotto:bookmarked", "a");
    expect(container.querySelector(".photo-ribbon")).not.toHaveClass("verb-tuck");
    emit("sotto:bookmark-failed", "a");
    expect(container.querySelector(".photo-ribbon")).toBeNull();
  });
});
