import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import NotFound from "./not-found";

describe("not-found（SPEC motion §5.14）", () => {
  it("やわらげた文と、トップへ・地図への2つの導線（挿絵は飾り）", () => {
    const { container } = render(<NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "あれ、この道の先にはページがありませんでした" })).toBeInTheDocument();
    expect(screen.getByText("移動したか、なくなってしまったのかもしれません。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "トップへ戻る" })).toHaveAttribute("href", "/start");
    expect(screen.getByRole("link", { name: "地図を見る" })).toHaveAttribute("href", "/sapporo");
    expect(container.querySelector(".nf-art")).toHaveAttribute("aria-hidden", "true");
  });
});
