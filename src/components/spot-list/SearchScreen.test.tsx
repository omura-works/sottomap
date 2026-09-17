import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { City } from "@/lib/db/types";
import { SearchScreen } from "./SearchScreen";

// SPEC §9.14-14: デバウンスのタイマーが古い searchParams を閉じ込めないことを検証するため、
// router.replace で更新した URL を useSearchParams が読み返すように、簡易な可変ストアを使う。
// slow を true にすると、router.replace を呼んでも useSearchParams が古い URL を返し続ける
// （遷移が 300ms 以上終わらない状態）を再現する。
const { getParams, replaceMock, nav } = vi.hoisted(() => {
  let current = new URLSearchParams();
  const nav = { slow: false, reset: () => (current = new URLSearchParams()) };
  const replaceMock = vi.fn((url: string) => {
    if (nav.slow) return;
    const [, qs = ""] = url.split("?");
    current = new URLSearchParams(qs);
  });
  return { getParams: () => current, replaceMock, nav };
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/sapporo/search",
  useRouter: () => ({ replace: replaceMock }),
  useSearchParams: () => getParams(),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/components/map/geo", () => ({
  buildDistanceMap: () => ({}),
  useOrigin: (fallback: { lat: number; lng: number }) => ({ origin: fallback, resolved: false }),
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

describe("SearchScreen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    replaceMock.mockClear();
    nav.slow = false;
    nav.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("SPEC §9.14-14: 入力直後にチップを操作しても、後発の検索語反映がチップ条件を消さない", () => {
    const { rerender } = render(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now"]} query="" />);

    // 検索語を入力（まだ300msのデバウンスは発火していない）。
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "海鮮丼" } });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // デバウンス完了前にチップをタップ。即座に filters が URL へ反映される。
    fireEvent.click(screen.getByRole("button", { name: "昼だけ" }));
    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(replaceMock.mock.calls[0][0]).toContain("filters=quiet-now%2Cday-only");

    // チップ操作後に画面が再描画され、useSearchParams が最新のURLを返すようになる想定。
    rerender(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now", "day-only"]} query="" />);

    // 残りのデバウンス時間が経過し、検索語がURLへ反映される。
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(replaceMock).toHaveBeenCalledTimes(2);
    const lastUrl = replaceMock.mock.calls[1][0] as string;
    expect(lastUrl).toContain("q=%E6%B5%B7%E9%AE%AE%E4%B8%BC");
    expect(lastUrl).toContain("filters=quiet-now%2Cday-only");
  });

  it("遷移が300ms以上終わらず再描画もされなくても、検索語の反映がチップ条件を消さない", () => {
    nav.slow = true;
    render(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now"]} query="" />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "海鮮丼" } });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    fireEvent.click(screen.getByRole("button", { name: "昼だけ" }));
    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(replaceMock).toHaveBeenCalledTimes(2);
    const lastUrl = replaceMock.mock.calls[1][0] as string;
    expect(lastUrl).toContain("q=%E6%B5%B7%E9%AE%AE%E4%B8%BC");
    expect(lastUrl).toContain("filters=quiet-now%2Cday-only");
  });

  it("遷移中にチップを続けて押しても、両方の条件が残る", () => {
    nav.slow = true;
    render(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now"]} query="" />);

    fireEvent.click(screen.getByRole("button", { name: "昼だけ" }));
    fireEvent.click(screen.getByRole("button", { name: "現金のみ" }));

    const lastUrl = replaceMock.mock.calls.at(-1)?.[0] as string;
    const filters = new URLSearchParams(lastUrl.split("?")[1]).get("filters")?.split(",") ?? [];
    expect(filters).toEqual(expect.arrayContaining(["quiet-now", "day-only", "cash-only"]));
  });

  it("SPEC §9.14-14: ブラウザの戻る操作で入力欄がURLのqueryに同期する", () => {
    const { rerender } = render(<SearchScreen city={CITY} spots={[]} activeFilters={[]} query="海鮮丼" />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("海鮮丼");

    // 戻る操作で query が空に戻る。
    rerender(<SearchScreen city={CITY} spots={[]} activeFilters={[]} query="" />);
    expect(input.value).toBe("");
  });
});
