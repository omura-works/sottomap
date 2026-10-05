import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Spot } from "@/lib/db/types";
import { PendingSpotList } from "./PendingSpotList";

vi.mock("@/app/actions/spot-endorse", () => ({ endorseSpot: vi.fn() }));

function spot(id: string, authorId: string, endorsementCount: number): Spot {
  return {
    id, cityId: "c", citySlug: "sapporo", cityName: "札幌", name: `店${id}`, areaName: "北24条", address: null, category: null,
    lat: 43, lng: 141, status: "pending", quietness: "quiet", reason: "静か", visitFrequency: "monthly", authorId, authorLabel: null,
    photoUrl: null, tags: [], endorsementCount, verifierCount: 0, lastVerifiedAt: null, nextVerificationAt: null, publishedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z", distanceMeters: null, walkMinutes: null, openRequestId: null,
  };
}

describe("PendingSpotList（SPEC motion §5.8-3）", () => {
  it("見出しは h2 とリード。自分のピンには新しい文、ほかの人のピンには「行ったことがある」", () => {
    render(<PendingSpotList spots={[spot("a", "me", 1), spot("b", "other", 0)]} citySlug="sapporo" viewerId="me" />);
    expect(screen.getByRole("heading", { level: 2, name: "承認待ちのピン" })).toBeInTheDocument();
    expect(screen.getByText("同じ街の人が立てたピンです。行ったことがあれば、教えてください。")).toBeInTheDocument();
    expect(screen.getByText("自分で立てたピンには、承認できません。")).toBeInTheDocument();
    expect(screen.getByText("承認 1/2")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "行ったことがある" })).toHaveLength(1);
  });

  it("0件は §4.6（ひと言＋説明＋灯りの子）", () => {
    const { container } = render(<PendingSpotList spots={[]} citySlug="sapporo" viewerId="me" />);
    expect(screen.getByText("いま、承認待ちのピンはありません")).toBeInTheDocument();
    expect(screen.getByText("この街で新しいピンが立ったら、ここに出てきます。")).toBeInTheDocument();
    expect(container.querySelector(".lantern-child")).not.toBeNull();
  });
});
