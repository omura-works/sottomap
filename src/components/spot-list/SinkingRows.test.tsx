import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockReducedMotion } from "@/components/motion/test-utils";
import type { Spot } from "@/lib/db/types";
import { planSink, SINK_LAYOUT_MAX_ROWS, SinkingRows } from "./SinkingRows";

function spot(id: string): Spot {
  return {
    id,
    cityId: "city-1",
    citySlug: "sapporo",
    cityName: "札幌",
    name: `店${id}`,
    areaName: null,
    address: null,
    category: null,
    lat: 43.06,
    lng: 141.35,
    status: "published",
    quietness: "quiet",
    reason: "",
    visitFrequency: "monthly",
    authorId: "author-1",
    authorLabel: null,
    photoUrl: null,
    tags: [],
    endorsementCount: 2,
    verifierCount: 1,
    lastVerifiedAt: null,
    nextVerificationAt: null,
    publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    distanceMeters: null,
    walkMinutes: null,
    openRequestId: null,
  };
}

const row = (s: Spot) => <a href={`/sapporo/spots/${s.id}`}>{s.name}</a>;

describe("SinkingRows（静かに下がる。SPEC motion §5.3）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("行が 40 以下なら並べ替えを動かす（layout を付ける）", () => {
    mockReducedMotion(false);
    const top = Array.from({ length: SINK_LAYOUT_MAX_ROWS }, (_, i) => spot(`t${i}`));
    render(<SinkingRows top={top} bottom={[]} renderRow={row} dividerHeading="h2" />);
    expect(screen.getAllByRole("list")[0]).toHaveAttribute("data-layout", "on");
  });

  it("行が 40 を超えると layout を付けない（即時に並ぶ）", () => {
    mockReducedMotion(false);
    const top = Array.from({ length: SINK_LAYOUT_MAX_ROWS - 1 }, (_, i) => spot(`t${i}`));
    const bottom = [spot("b0"), spot("b1")];
    render(<SinkingRows top={top} bottom={bottom} renderRow={row} dividerHeading="h2" />);
    for (const list of screen.getAllByRole("list")) expect(list).toHaveAttribute("data-layout", "off");
  });

  it("reduce のときは layout を付けない", () => {
    mockReducedMotion(true);
    render(<SinkingRows top={[spot("a")]} bottom={[spot("b")]} renderRow={row} dividerHeading="h2" />);
    for (const list of screen.getAllByRole("list")) expect(list).toHaveAttribute("data-layout", "off");
  });

  it("下の一覧があるときだけ区切り（見出し＋一文）を出す", () => {
    const { rerender } = render(<SinkingRows top={[spot("a")]} bottom={[]} renderRow={row} dividerHeading="h4" />);
    expect(screen.queryByRole("heading", { name: "混みはじめた店" })).not.toBeInTheDocument();
    rerender(<SinkingRows top={[spot("a")]} bottom={[spot("b")]} renderRow={row} dividerHeading="h4" />);
    expect(screen.getByRole("heading", { level: 4, name: "混みはじめた店" })).toBeInTheDocument();
    expect(screen.getByText("ここから下は、少しにぎやかになってきた店です。")).toBeInTheDocument();
  });

  it("滑る量: 前の位置（＋滑っている途中の分）と新しい位置の差。新しく出た行と動かない行は滑らせない", () => {
    const before = new Map([
      ["a", 0],
      ["b", 80],
      ["c", 160],
    ]);
    const after = new Map([
      ["a", 0],
      ["b", 260],
      ["d", 340],
    ]);
    expect(planSink(before, after)).toEqual(new Map([["b", -180]]));
    // b が 30px 下へずれた途中（translate 30px）から、さらに並び替わった
    expect(planSink(before, after, new Map([["b", 30]]))).toEqual(new Map([["b", -150]]));
  });

  it("もう一方の一覧へ移った行は二重に見えない（出ていく側は流れから外し、見せない）", () => {
    mockReducedMotion(false);
    const a = spot("a");
    const b = spot("b");
    const { container, rerender } = render(<SinkingRows top={[a, b]} bottom={[]} renderRow={row} dividerHeading="h2" />);
    rerender(<SinkingRows top={[a]} bottom={[b]} renderRow={row} dividerHeading="h2" />);
    const rowsB = Array.from(container.querySelectorAll<HTMLElement>('[data-row-id="b"]'));
    const shown = rowsB.filter((el) => el.style.display !== "none");
    expect(shown).toHaveLength(1);
    expect(shown[0].closest("ul")).toHaveClass("spot-rows-sunk");
    // 出ていく側は inert（フォーカスの候補から外れる）
    for (const el of rowsB.filter((el) => el.style.display === "none")) expect(el).toHaveAttribute("inert");
  });

  it("絞り込みで消える行は、消えるまで inert", () => {
    mockReducedMotion(false);
    const a = spot("a");
    const b = spot("b");
    const { container, rerender } = render(<SinkingRows top={[a, b]} bottom={[]} renderRow={row} dividerHeading="h2" />);
    rerender(<SinkingRows top={[a]} bottom={[]} renderRow={row} dividerHeading="h2" />);
    const leaving = container.querySelector('[data-row-id="b"]');
    expect(leaving).not.toBeNull();
    expect(leaving).toHaveAttribute("inert");
    expect(container.querySelector('[data-row-id="a"]')).not.toHaveAttribute("inert");
  });
});
