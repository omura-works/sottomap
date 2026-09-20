import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import FaqPage from "./page";

describe("FaqPage", () => {
  it("見出しを表示する", () => {
    render(<FaqPage />);
    expect(screen.getByRole("heading", { level: 1, name: "よくある質問" })).toBeInTheDocument();
  });

  it("最低15問を折りたたみ（details/summary）で並べる", () => {
    render(<FaqPage />);
    const groups = document.querySelectorAll("details");
    expect(groups.length).toBeGreaterThanOrEqual(15);
    groups.forEach((detail) => {
      expect(detail.querySelector("summary")).not.toBeNull();
    });
  });

  it("90日ごとの確認・分速80mなど実装に基づいた回答を含む", () => {
    render(<FaqPage />);
    expect(screen.getByText(/分速80メートル/)).toBeInTheDocument();
    expect(screen.getByText(/約180日/)).toBeInTheDocument();
    expect(screen.getByText(/8つの街/)).toBeInTheDocument();
  });

  it("すべての summary がキーボードで開閉できる（ネイティブ要素）", () => {
    render(<FaqPage />);
    const summaries = document.querySelectorAll("summary");
    summaries.forEach((summary) => {
      expect(summary.tagName).toBe("SUMMARY");
    });
  });
});
