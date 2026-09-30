import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  // 栞の状態の写し（MapPin.bookmarked）が渡っているかも見えるように、ピンごとに data-bookmarked を出す。
  MapCanvas: ({
    onHoverPin,
    pins,
    introKey,
  }: {
    onHoverPin?: (id: string | null, point: { x: number; y: number } | null) => void;
    pins: { id: string; bookmarked?: boolean }[];
    introKey?: string;
  }) => (
    <div data-testid="map" data-intro-key={introKey}>
      {pins.map((pin) => (
        <span key={pin.id} data-testid={`pin-${pin.id}`} data-bookmarked={pin.bookmarked ? "true" : "false"} />
      ))}
      <button
        type="button"
        onMouseEnter={() => onHoverPin?.("spot-1", { x: 10, y: 20 })}
        onMouseLeave={() => onHoverPin?.(null, null)}
        onFocus={() => onHoverPin?.("spot-1", { x: 10, y: 20 })}
        onBlur={() => onHoverPin?.(null, null)}
      >
        地図のピン
      </button>
    </div>
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

  it("SPEC §9.14-12: フォーカスでもホバーカードと同等の情報が開く", async () => {
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
    // 閉じるときは 120ms で消えてから取り除かれる（SPEC motion §5.2）
    await waitFor(() =>
      expect(screen.queryByText("魚屋の直営。狸小路の方が行きやすいが、こちらの方が安い。")).not.toBeInTheDocument(),
    );
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

    // PC の列は §4.6 の空の状態（ひと言＋説明）、スマホの札は一文
    expect(screen.getByText("その条件だと、見つかりませんでした")).toBeInTheDocument();
    expect(screen.getByText("チップを1つはずしてみてください。")).toBeInTheDocument();
    expect(screen.getByText(/^その条件だと、見つかりませんでした。/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "ピンを立てる" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "しぼりこみをはずす" }).length).toBe(2);
  });

  it("全チップOFF（filters=none）で0件なら、本当に未登録として「この街には、まだピンがありません」を出す", () => {
    render(
      <CityMapScreen city={CITY} spots={[]} quietCount={0} activeFilters={[]} focusedSpotIds={null} />,
    );

    expect(screen.getByText("この街には、まだピンがありません")).toBeInTheDocument();
    expect(screen.getByText("最初の一軒、立ててみませんか？")).toBeInTheDocument();
    expect(screen.getByText(/^この街には、まだピンがありません。最初の一軒、立ててみませんか？/)).toBeInTheDocument();
    expect(screen.queryAllByText(/その条件だと/)).toHaveLength(0);
    expect(screen.queryAllByRole("button", { name: "しぼりこみをはずす" })).toHaveLength(0);
  });

  // Codex R9 重要2: 位置解決待ちの間はピンを出さず、その旨を控えめに表示する。
  it("URL座標が無く位置解決待ちの間は、ピンを出さず「いまいる場所をたしかめています…」を表示する", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[SPOT]}
        quietCount={1}
        activeFilters={["within-10min"]}
        focusedSpotIds={null}
      />,
    );

    expect(screen.getAllByText("いまいる場所をたしかめています…").length).toBe(2);
    expect(screen.queryByTestId("pin-spot-1")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "しぼりこみをはずす" })).not.toBeInTheDocument();
  });

  it("SPEC §9.14-16: 絞り込みが既定のまま0件（本当に未登録）なら未登録の文を出し、解除導線は出さない", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[]}
        quietCount={0}
        activeFilters={["quiet-now"]}
        focusedSpotIds={null}
      />,
    );

    expect(screen.getByText("この街には、まだピンがありません")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "しぼりこみをはずす" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "ピンを立てる" }).length).toBeGreaterThan(0);
  });

  it("SPEC motion §5.2: 件数・承認待ちへの導線・＋ ピンを立てる・栞の丸が新しい見た目の文になる", () => {
    render(<CityMapScreen city={CITY} spots={[SPOT]} quietCount={1} activeFilters={[]} focusedSpotIds={null} />);

    expect(screen.getByText(/地元の人が「まだ静か」とたしかめた店、/)).toBeInTheDocument();
    expect(screen.getByText(/^静かなまま、/)).toBeInTheDocument();
    // →（飾り）は読み上げない
    expect(screen.getAllByRole("link", { name: "承認待ちのピンをのぞく" })).toHaveLength(2);
    // 「＋」だけの丸をやめ、見える字がそのまま名前になる（aria-label は付けない）
    const add = screen.getAllByRole("link", { name: "ピンを立てる" })[0];
    expect(add).not.toHaveAttribute("aria-label");
    expect(add).toHaveClass("map-add");
    const bm = screen.getByRole("link", { name: "栞" });
    expect(bm).toHaveAttribute("data-lamp-target", "bookmarks");
    expect(screen.getByTestId("map")).toHaveAttribute("data-intro-key", "sapporo");
  });

  it("SPEC motion §5.2: sotto:bookmarked でそのピンが栞の見た目になり、sotto:bookmark-failed で戻る", () => {
    render(<CityMapScreen city={CITY} spots={[SPOT]} quietCount={1} activeFilters={[]} focusedSpotIds={null} />);
    expect(screen.getByTestId("pin-spot-1")).toHaveAttribute("data-bookmarked", "false");

    act(() => {
      window.dispatchEvent(new CustomEvent("sotto:bookmarked", { detail: { spotId: "spot-1" } }));
    });
    expect(screen.getByTestId("pin-spot-1")).toHaveAttribute("data-bookmarked", "true");

    act(() => {
      window.dispatchEvent(new CustomEvent("sotto:bookmark-failed", { detail: { spotId: "spot-1" } }));
    });
    expect(screen.getByTestId("pin-spot-1")).toHaveAttribute("data-bookmarked", "false");
  });

  it("最初から栞に挟んでいる店のピンは栞の見た目で渡る", () => {
    render(
      <CityMapScreen
        city={CITY}
        spots={[SPOT]}
        quietCount={1}
        activeFilters={[]}
        focusedSpotIds={null}
        bookmarkedSpotIds={["spot-1"]}
      />,
    );
    expect(screen.getByTestId("pin-spot-1")).toHaveAttribute("data-bookmarked", "true");
  });
});
