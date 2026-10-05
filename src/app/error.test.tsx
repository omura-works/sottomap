import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ErrorPage from "./error";

describe("error.tsx（SPEC motion §5.15）", () => {
  it("新しい文を出し、「もう一度試す」で retry をすぐ呼び、提灯の光が満ちる", () => {
    const retry = vi.fn();
    const { container } = render(<ErrorPage error={new Error("x")} retry={retry} />);
    expect(screen.getByRole("heading", { level: 1, name: "うまく開けませんでした" })).toBeInTheDocument();
    expect(screen.getByText("少し時間をおいて、もう一度ためしてみてください。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "もう一度試す" }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".error-lantern")).toHaveClass("is-full");
  });
});
