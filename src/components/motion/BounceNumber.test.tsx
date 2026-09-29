import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { BounceNumber } from "./BounceNumber";
import { mockReducedMotion } from "./test-utils";

function bounceOf(container: HTMLElement) {
  return container.querySelector(".bounce-number") as HTMLElement;
}

describe("BounceNumber", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("最初の描画では跳ねない", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { container } = render(<BounceNumber value={12} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bounceOf(container)).not.toHaveClass("is-bumping");
    expect(bounceOf(container)).not.toHaveAttribute("data-bump");
  });

  it("値が変わると、桁が止まったころに跳ねるクラスが付く（続けて変わると名前を替えて再生）", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { container, rerender } = render(<BounceNumber value={12} />);
    rerender(<BounceNumber value={9} />);
    expect(bounceOf(container)).not.toHaveClass("is-bumping");
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(bounceOf(container)).toHaveClass("is-bumping");
    expect(bounceOf(container)).toHaveAttribute("data-bump", "a");
    rerender(<BounceNumber value={4} />);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(bounceOf(container)).toHaveAttribute("data-bump", "b");
  });

  it("reduce では跳ねない", () => {
    vi.useFakeTimers();
    mockReducedMotion(true);
    const { container, rerender } = render(<BounceNumber value={3} />);
    rerender(<BounceNumber value={5} />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(bounceOf(container)).not.toHaveClass("is-bumping");
  });

  it("読み上げは AnimatedCounter の sr-only の数字のまま（要素を増やさない）", () => {
    const { container } = render(<BounceNumber value={27} />);
    const srOnly = container.querySelectorAll(".sr-only");
    expect(srOnly).toHaveLength(1);
    expect(srOnly[0]).toHaveTextContent("27");
  });
});
