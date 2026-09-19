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
  parseUrlOrigin: () => null,
  useResolvedOrigin: (origin: { lat: number; lng: number }) => ({ origin, resolved: false, isPrecise: false }),
  walkingLabel: () => "徒歩7分",
}));

vi.mock("./index", () => ({
  // SPEC §9.14-12: MapCanvas 本体はホバー・フォーカス・タップの3つを同等に
  // onHoverPin へ通知する（src/components/map/MapCanvas.tsx）。ここでは呼び出し側
  // （CityMapScreen）がその通知を正しく受け取れることだけをフォーカス操作でも検証する。
  MapCanvas: ({
    onHoverPin,
  }: {
    onHoverPin?: (id: string | null, point: { x: number; y: number } | null) => void;
  }) => (
    <button
      type="button"
      onMouseEnter={() => onHoverPin?.("spot-1", { x: 10, y: 20 })}
      onMouseLeave={() => onHoverPin?.(null, null)}
      onFocus={() => onHoverPin?.("spot-1", { x: 10, y: 20 })}
      onBlur={() => onHoverPin?.(null, null)}
    >
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

  it("SPEC §9.14-12: フォーカスでもホバーカードと同等の情報が開く", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[SPOT]}
        quietCount={1}
        activeFilters={[]}
        focusedSpotIds={null}
      />,
    );

    const pin = screen.getByRole("button", { name: "地図のピン" });
    fireEvent.focus(pin);
    expect(screen.getByText("魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。")).toBeInTheDocument();

    fireEvent.blur(pin);
    expect(
      screen.queryByText("魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。"),
    ).not.toBeInTheDocument();
  });

  it("SPEC §9.14-8（改訂）: 見出しは街の名前だけで、エリア名を付けない", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[SPOT]}
        quietCount={1}
        activeFilters={[]}
        focusedSpotIds={null}
      />,
    );

    expect(screen.getAllByRole("heading", { level: 1, name: "札幌" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("札幌・北24条")).not.toBeInTheDocument();
  });

  it("SPEC §9.14-16: 除外する絞り込みが付いて0件のとき、条件に合う旨と解除導線を出す", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[]}
        quietCount={0}
        activeFilters={["quiet-now", "day-only"]}
        focusedSpotIds={null}
      />,
    );

    expect(screen.getAllByText("条件に合う店が見つかりませんでした。").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "ピンを立てる" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "絞り込みを解除する" }).length).toBeGreaterThan(0);
  });

  it("全チップOFF（filters=none）で0件なら、本当に未登録として「まだ店がありません。」を出す", () => {
    render(
      <CityMapScreen city={CITY} spots={[]} quietCount={0} activeFilters={[]} focusedSpotIds={null} />,
    );

    expect(screen.getAllByText("まだ店がありません。").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("条件に合う店が見つかりませんでした。")).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "絞り込みを解除する" })).toHaveLength(0);
  });

  // Codex R9 重要2: 位置解決待ちの間はピンを出さず、その旨を控えめに表示する。
  it("URL座標が無く位置解決待ちの間は、ピンを出さず「現在地を確認しています…」を表示する", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[SPOT]}
        quietCount={1}
        activeFilters={["within-10min"]}
        focusedSpotIds={null}
      />,
    );

    expect(screen.getAllByText("現在地を確認しています…").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "絞り込みを解除する" })).not.toBeInTheDocument();
  });

  it("SPEC §9.14-16: 絞り込みが既定のまま0件（本当に未登録）なら「まだ店がありません。」を出し、解除導線は出さない", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[]}
        quietCount={0}
        activeFilters={["quiet-now"]}
        focusedSpotIds={null}
      />,
    );

    expect(screen.getAllByText("まだ店がありません。").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "絞り込みを解除する" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "ピンを立てる" }).length).toBeGreaterThan(0);
  });
});
