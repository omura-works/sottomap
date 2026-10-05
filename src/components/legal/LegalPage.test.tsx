import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalPage, LegalSection } from "./LegalPage";

describe("LegalPage・LegalSection（SPEC motion §5.13）", () => {
  it("節の見出しは h2（見た目はクラスで。インラインの大きさ指定をしない）、読んだところまでの線は飾り", () => {
    const { container } = render(
      <LegalPage title="利用規約">
        <LegalSection heading="1. はじめに">
          <p>本文</p>
        </LegalSection>
      </LegalPage>,
    );
    const h2 = screen.getByRole("heading", { level: 2, name: "1. はじめに" });
    expect(h2).toHaveClass("legal-h2");
    expect(h2.getAttribute("style")).toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "利用規約" })).toBeInTheDocument();
    expect(container.querySelector(".legal-read-line")).toHaveAttribute("aria-hidden", "true");
  });
});
