import * as React from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ViewTransition } from "./view-transition";
import { PageLamp } from "./PageLamp";
import { PageTransition } from "./PageTransition";

// 単体テストが読む React（安定版）には ViewTransition が無い。包みは子をそのまま描く（SPEC motion §4.2）。
describe("ViewTransition の包み", () => {
  it("この環境の React には ViewTransition が無い（前提の確認）", () => {
    expect((React as unknown as { ViewTransition?: unknown }).ViewTransition).toBeUndefined();
  });

  it("無い環境では子をそのまま描く", () => {
    render(
      <ViewTransition name="page-lamp" default="none">
        <p>子の要素</p>
      </ViewTransition>,
    );
    expect(screen.getByText("子の要素")).toBeInTheDocument();
  });

  it("PageLamp は飾りの灯りを1つ描く（読み上げない）", () => {
    const { container } = render(<PageLamp tone="night" />);
    const lamps = container.querySelectorAll(".page-lamp");
    expect(lamps).toHaveLength(1);
    expect(lamps[0]).toHaveAttribute("aria-hidden", "true");
    expect(lamps[0]).toHaveAttribute("data-tone", "night");
  });

  it("PageTransition は中身を [data-page-root] の div で包む", () => {
    const { container } = render(
      <PageTransition>
        <main>ページ</main>
      </PageTransition>,
    );
    const root = container.querySelector("[data-page-root]");
    expect(root).not.toBeNull();
    expect(root?.getAttribute("style")).toBeNull();
    expect(root).toContainElement(screen.getByText("ページ"));
  });
});
