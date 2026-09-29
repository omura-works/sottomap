import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Stamp, stampFontSize } from "./Stamp";

describe("Stamp", () => {
  it("label が無ければ飾り（aria-hidden）", () => {
    const { container } = render(<Stamp glyph="静" tone="quiet" size={30} />);
    const stamp = container.querySelector(".stamp");
    expect(stamp).toHaveAttribute("aria-hidden", "true");
    expect(stamp).not.toHaveAttribute("role");
  });

  it("label があれば role=img と aria-label", () => {
    render(<Stamp glyph="並" tone="crowding" size={48} label="並びはじめた" />);
    const stamp = screen.getByRole("img", { name: "並びはじめた" });
    expect(stamp).toHaveTextContent("並");
    expect(stamp).not.toHaveAttribute("aria-hidden");
  });

  it.each([
    [26, "静", 14],
    [30, "静", 15],
    [48, "観", 24],
    [56, "静", 28],
    [72, "灯", 36],
    [56, "受付", 19],
  ] as const)("直径 %i・「%s」の字は %ipx", (size, glyph, px) => {
    expect(stampFontSize(size, glyph)).toBe(px);
    const { container } = render(<Stamp glyph={glyph} tone="orange" size={size} />);
    const stamp = container.querySelector<HTMLElement>(".stamp");
    expect(stamp?.style.fontSize).toBe(`${px}px`);
    expect(stamp?.style.getPropertyValue("--sz")).toBe(`${size}px`);
  });

  it("配色と傾き・押す動きを属性とクラスで持つ", () => {
    const { container } = render(<Stamp glyph="観" tone="touristy" size={56} tilt={-4} animate="press" />);
    const stamp = container.querySelector<HTMLElement>(".stamp");
    expect(stamp).toHaveAttribute("data-tone", "touristy");
    expect(stamp?.style.getPropertyValue("--tilt")).toBe("-4deg");
    expect(stamp).toHaveClass("verb-stamp");
  });
});
