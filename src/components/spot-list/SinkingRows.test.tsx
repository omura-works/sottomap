import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockReducedMotion } from "@/components/motion/test-utils";
import type { Spot } from "@/lib/db/types";
import { SINK_LAYOUT_MAX_ROWS, SinkingRows } from "./SinkingRows";

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
});
