import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Badge } from "@/lib/db/types";
import { KEEPER_BADGE_THRESHOLD, WINTER_BADGE_THRESHOLD, badgeThreshold } from "@/lib/domain/lantern";
import { LanternBadge } from "./LanternBadge";

const keeper: Badge = { id: "keeper", slug: "keeper", glyph: "灯", label: "番人", earned: false, remaining: 15 };
const winter: Badge = { id: "winter", slug: "winter", glyph: "雪", label: "冬も歩いた", earned: true, remaining: 0 };

describe("灯りのバッジ（SPEC motion §5.6）", () => {
  it("必要件数は定義どおり", () => {
    expect(badgeThreshold("keeper")).toBe(KEEPER_BADGE_THRESHOLD);
    expect(badgeThreshold("winter")).toBe(WINTER_BADGE_THRESHOLD);
  });

  it("未取得: 「あと○件」と、進み具合を progressbar で伝える（半透明にしない）", () => {
    const { container } = render(<LanternBadge badge={keeper} />);
    expect(screen.getByText("番人")).toBeInTheDocument();
    expect(screen.getByText("あと15件でともる")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "番人の進み具合" });
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", String(KEEPER_BADGE_THRESHOLD));
    expect(bar).toHaveAttribute("aria-valuenow", String(KEEPER_BADGE_THRESHOLD - 15));
    // SPEC motion §5.6: 棒は width を動かさず、--p（0〜1）で scale する
    expect(bar.style.getPropertyValue("--p")).toBe("0.25");
    expect((bar.querySelector(".lantern-progress-fill") as HTMLElement).style.width).toBe("");
    expect((container.firstElementChild as HTMLElement).style.opacity).toBe("");
  });

  it("取得済み: 「ともりました」、棒は満タン、漢字が灯る（光は層で持ち text-shadow は使わない）", () => {
    const { container } = render(<LanternBadge badge={winter} />);
    expect(screen.getByText("ともりました")).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "冬も歩いたの進み具合" });
    expect(bar).toHaveAttribute("aria-valuenow", String(WINTER_BADGE_THRESHOLD));
    expect(bar.style.getPropertyValue("--p")).toBe("1");
    expect(container.querySelector(".lantern-badge")).toHaveAttribute("data-earned", "true");
    expect(screen.getByText("雪").style.textShadow).toBe("");
    // 火の粉6つ（飾り）
    expect(container.querySelectorAll(".lantern-badge-spark")).toHaveLength(6);
  });
});
