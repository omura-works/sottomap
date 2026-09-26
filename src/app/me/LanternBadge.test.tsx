import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Badge } from "@/lib/db/types";
import { KEEPER_BADGE_THRESHOLD, WINTER_BADGE_THRESHOLD, badgeThreshold } from "@/lib/domain/lantern";
import { LanternBadge } from "./LanternBadge";

const keeper: Badge = { id: "keeper", slug: "keeper", glyph: "灯", label: "番人", earned: false, remaining: 15 };
const winter: Badge = { id: "winter", slug: "winter", glyph: "雪", label: "冬も歩いた", earned: true, remaining: 0 };

describe("灯りのバッジ（案B）", () => {
  it("必要件数は定義どおり", () => {
    expect(badgeThreshold("keeper")).toBe(KEEPER_BADGE_THRESHOLD);
    expect(badgeThreshold("winter")).toBe(WINTER_BADGE_THRESHOLD);
  });

  it("未取得: 「あと○件」と、進み具合を progressbar で伝える（半透明にしない）", () => {
    const { container } = render(<LanternBadge badge={keeper} />);
    expect(screen.getByText("番人")).toBeInTheDocument();
    expect(screen.getByText("あと15件")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "番人の進み具合" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", String(KEEPER_BADGE_THRESHOLD));
    expect(bar).toHaveAttribute("aria-valuenow", String(KEEPER_BADGE_THRESHOLD - 15));
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("25%");
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("");
  });

  it("取得済み: 「獲得済み」、棒は満タン、漢字が灯る", () => {
    render(<LanternBadge badge={winter} />);
    expect(screen.getByText("獲得済み")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "冬も歩いたの進み具合" });
    expect(bar).toHaveAttribute("aria-valuenow", String(WINTER_BADGE_THRESHOLD));
    expect((bar.firstElementChild as HTMLElement).style.width).toBe("100%");
    expect(screen.getByText("雪")).toHaveStyle({ color: "var(--color-accent-200)" });
  });
});
