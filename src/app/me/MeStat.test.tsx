import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Stat } from "./MeStat";

describe("/me の数字の付箋（SPEC motion §5.6）", () => {
  it("数字・単位・ラベルを出し、最初から読める（keep-visible）。0 から数え上げない", () => {
    const { container } = render(<Stat index={1} tone="moss" tilt={1} value={12} unit="回" label="たしかめた回数" />);
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("回")).toBeInTheDocument();
    expect(screen.getByText("たしかめた回数")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("sticky", "keep-visible");
    expect(container.firstElementChild).toHaveAttribute("data-tone", "moss");
    expect(screen.getByText("12")).not.toHaveAttribute("data-digits");
  });

  it("3桁以上になる値は data-digits で字を小さくする", () => {
    render(<Stat index={0} tone="orange" tilt={-1.5} value={128} unit="本" label="立てたピン" />);
    expect(screen.getByText("128")).toHaveAttribute("data-digits", "3");
  });
});
