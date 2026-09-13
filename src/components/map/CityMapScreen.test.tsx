import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { City, Spot } from "@/lib/db/types";
import { CityMapScreen } from "./CityMapScreen";

vi.mock("next/navigation", () => ({
  usePathname: () => "/sapporo",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  unstable_rethrow: vi.fn(),
}));

vi.mock("./geo", () => ({
  buildDistanceMap: () => ({ "spot-1": 560 }),
  mostCommonAreaName: () => null,
  useOrigin: (origin: { lat: number; lng: number }) => ({ origin, resolved: false, isPrecise: false }),
  walkingLabel: () => "徒歩7分",
}));

vi.mock("./index", () => ({
  MapCanvas: ({
    onHoverPin,
  }: {
    onHoverPin?: (id: string | null, point: { x: number; y: number } | null) => void;
  }) => (
    <button type="button" onMouseEnter={() => onHoverPin?.("spot-1", { x: 10, y: 20 })}>
      地図のピン
    </button>
  ),
}));

const CITY: City = {
  id: "city-1",
  slug: "sapporo",
  name: "札幌",
  nameKana: "さっぽろ",
  isPort: false,
  centerLat: 43.0621,
  centerLng: 141.3544,
  defaultZoom: 12.5,
  featuredArea: "北24条",
};

const SPOT = {
  id: "spot-1",
  cityId: CITY.id,
  citySlug: CITY.slug,
  cityName: CITY.name,
  name: "シハチ鮮魚店 北24条店",
  areaName: "北24条",
  address: null,
  category: "海鮮丼",
  lat: 43.0847,
  lng: 141.3486,
  status: "published",
  quietness: "quiet",
  reason: "魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。",
  visitFrequency: "monthly",
  authorId: "user-1",
  authorLabel: "北24条に14年、Kさん",
  photoUrl: null,
  tags: [],
  endorsementCount: 2,
  verifierCount: 3,
  lastVerifiedAt: "2026-09-01T00:00:00.000Z",
  nextVerificationAt: null,
  publishedAt: "2026-01-01T00:00:00.000Z",
  createdAt: "2025-12-01T00:00:00.000Z",
  distanceMeters: null,
  walkMinutes: null,
  openRequestId: null,
  hoverDescription: "魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。",
} satisfies Spot & { hoverDescription: string };

describe("CityMapScreen", () => {
  it("ホバーカード専用文言をスポットデータから表示する", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[SPOT]}
        quietCount={1}
        activeFilters={[]}
        focusedSpotIds={null}
      />,
    );

    fireEvent.mouseEnter(screen.getByRole("button", { name: "地図のピン" }));

    expect(screen.getByText("魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。")).toBeInTheDocument();
  });
});
