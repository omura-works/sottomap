import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LazyAnimatedCounter } from "./LazyAnimatedCounter";

// P7: 数字が変わるまでは motion を読まない静かな版を描き、変わったら AnimatedCounter に替えて新しい数字にする。
describe("LazyAnimatedCounter", () => {
  it("最初は静かな版で、読み上げの数字は今の値", () => {
    const { container } = render(<LazyAnimatedCounter value={38} />);
    expect(container.querySelector("[data-slot='animated-counter']")).not.toBeNull();
    expect(screen.getByText("38")).toHaveClass("sr-only");
  });

  it("数字が変わると、AnimatedCounter を読み込んで新しい数字になる", async () => {
    const { rerender } = render(<LazyAnimatedCounter value={38} />);
    await act(async () => {
      rerender(<LazyAnimatedCounter value={12} />);
    });
    // 動的な import を待つ（全部のテストを並べて走らせると 1 秒を超えることがある）
    await waitFor(() => expect(screen.getByText("12")).toHaveClass("sr-only"), { timeout: 5000 });
    expect(screen.queryByText("38")).toBeNull();
  });
});
