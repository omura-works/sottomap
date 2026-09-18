import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { City, Spot } from "@/lib/db/types";
import { SearchScreen } from "./SearchScreen";

function makeSpot(overrides: Partial<Spot> & Pick<Spot, "id" | "name">): Spot {
  return {
    cityId: "city-1",
    citySlug: "sapporo",
    cityName: "札幌",
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
    ...overrides,
  };
}

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
  parseUrlOrigin: () => null,
  useResolvedOrigin: (fallback: { lat: number; lng: number }) => ({ origin: fallback, resolved: false, isPrecise: false }),
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
    // Codex R9 重要5: デバウンス発火時の window.location.pathname チェックが usePathname の
    // モック値（"/sapporo/search"）と一致するよう、実際の jsdom のURLも合わせておく。
    window.history.pushState({}, "", "/sapporo/search");
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

  // Codex R9 重要5: タイマー発火時にURLが検索ページのままでなければ router.replace しない。
  it("重要5: 検索入力直後に別画面へ遷移していたら、デバウンス発火時にrouter.replaceしない", () => {
    render(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now"]} query="" />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "海鮮丼" } });
    replaceMock.mockClear();

    // このコンポーネントはアンマウントせず、URLだけが別画面へ変わった状態を模す
    // （SPAの遷移中、次の画面の準備ができるまで前の画面が残っている場合がある）。
    window.history.pushState({}, "", "/sapporo");

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });

  // Codex R10 重要1: pathname ガードだけでは不十分（Next.js 16 は router state の
  // コミット時にURLを更新するため、遷移が完了するまで pathname は検索画面のままになり得る）。
  // 別画面へのリンクをクリックした「瞬間」にタイマーを取り消す必要がある。
  it("重要1(R10): 別画面へのリンクをクリックした直後は、pathnameが未コミットでもデバウンス発火時にrouter.replaceしない", () => {
    render(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now"]} query="" />);

    const anchor = document.createElement("a");
    anchor.href = "/sapporo";
    document.body.appendChild(anchor);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "海鮮丼" } });
    replaceMock.mockClear();

    // pathname（usePathname / window.location.pathname）はまだ "/sapporo/search" のまま
    // （Next.js 16のrouter stateコミット前を模す）で、リンクをクリックする。
    fireEvent.click(anchor);

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(replaceMock).not.toHaveBeenCalled();
    document.body.removeChild(anchor);
  });

  // Codex R10 重要1: ブラウザの戻る操作（popstate）でもタイマーを取り消す。
  it("重要1(R10): popstateが起きた直後は、デバウンス発火時にrouter.replaceしない", () => {
    render(<SearchScreen city={CITY} spots={[]} activeFilters={["quiet-now"]} query="" />);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "海鮮丼" } });
    replaceMock.mockClear();

    window.dispatchEvent(new PopStateEvent("popstate"));

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(replaceMock).not.toHaveBeenCalled();
  });
});

describe("SearchScreen（Codex R9 重要2: 位置解決待ち）", () => {
  beforeEach(() => {
    replaceMock.mockClear();
    nav.slow = false;
    nav.reset();
  });

  it("URL座標が無く位置解決待ちの間は、結果の代わりに「現在地を確認しています…」を表示する", () => {
    render(<SearchScreen city={CITY} spots={[]} activeFilters={["within-10min"]} query="" />);

    expect(screen.getByRole("heading", { level: 1, name: "現在地を確認しています…" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("現在地を確認しています…");
  });
});

// Codex R10 重要2: 位置解決後の過剰なフォーカス移動・結果差し替えの再通知。
describe("SearchScreen（Codex R10 重要2: 結果差し替え時のフォーカス・通知）", () => {
  const SPOT_A = makeSpot({ id: "spot-a", name: "店A" });
  const SPOT_B = makeSpot({ id: "spot-b", name: "店B" });
  const SPOT_C = makeSpot({ id: "spot-c", name: "店C" });

  beforeEach(() => {
    replaceMock.mockClear();
    nav.slow = false;
    nav.reset();
  });

  afterEach(() => {
    document.body.focus();
  });

  it("結果内にフォーカスが無ければ、結果が差し替わってもフォーカスを奪わない（bodyのままでも移さない）", () => {
    const { rerender } = render(<SearchScreen city={CITY} spots={[SPOT_A]} activeFilters={[]} query="" />);
    expect(document.activeElement).toBe(document.body);

    rerender(<SearchScreen city={CITY} spots={[SPOT_B]} activeFilters={[]} query="" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(document.activeElement).not.toBe(heading);
  });

  it("結果内の要素にフォーカスがあり、差し替えでその要素が消えたら見出しへフォーカスが移る", () => {
    const { rerender } = render(<SearchScreen city={CITY} spots={[SPOT_A, SPOT_B]} activeFilters={[]} query="" />);
    const linkA = screen.getByRole("link", { name: /店A/ });
    linkA.focus();
    expect(document.activeElement).toBe(linkA);

    // SPOT_A が結果から消える（SPOT_C に差し替わる）。
    rerender(<SearchScreen city={CITY} spots={[SPOT_B, SPOT_C]} activeFilters={[]} query="" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(document.activeElement).toBe(heading);
  });

  // Codex R11 重要1: 一度見出しへ救済した後、利用者が検索欄へ戻れば、次の結果更新でフォーカスを奪わない。
  it("見出しへ移した後に検索欄へ戻ったら、次の結果更新でも検索欄のフォーカスを保つ", () => {
    const { rerender } = render(<SearchScreen city={CITY} spots={[SPOT_A, SPOT_B]} activeFilters={[]} query="" />);
    screen.getByRole("link", { name: /店A/ }).focus();
    rerender(<SearchScreen city={CITY} spots={[SPOT_B, SPOT_C]} activeFilters={[]} query="" />);
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1 }));

    const searchbox = screen.getByRole("searchbox");
    searchbox.focus();
    rerender(<SearchScreen city={CITY} spots={[SPOT_C]} activeFilters={[]} query="" />);

    expect(document.activeElement).toBe(searchbox);
  });

  it("フォーカスしていた要素が差し替え後も残っていれば、見出しへフォーカスを移さない", () => {
    const { rerender } = render(<SearchScreen city={CITY} spots={[SPOT_A, SPOT_B]} activeFilters={[]} query="" />);
    const linkA = screen.getByRole("link", { name: /店A/ });
    linkA.focus();

    // SPOT_A は残り、SPOT_B が SPOT_C に差し替わる。
    rerender(<SearchScreen city={CITY} spots={[SPOT_A, SPOT_C]} activeFilters={[]} query="" />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(document.activeElement).not.toBe(heading);
    expect(screen.getByRole("link", { name: /店A/ })).toBe(document.activeElement);
  });

  it("件数が同じでも結果のID並びが変われば、ライブリージョンの通知が再度読み上げられる（一度空にして次のティックで設定）", async () => {
    vi.useFakeTimers();
    const { rerender } = render(<SearchScreen city={CITY} spots={[SPOT_A, SPOT_B]} activeFilters={[]} query="" />);
    expect(screen.getByRole("status")).toHaveTextContent("2軒見つかりました");

    // 件数は変わらないが、内容（ID並び）が変わる。
    rerender(<SearchScreen city={CITY} spots={[SPOT_A, SPOT_C]} activeFilters={[]} query="" />);

    // 一度空になる（同じ文言でも読み上げ直させるため）。
    expect(screen.getByRole("status")).toHaveTextContent("");

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(screen.getByRole("status")).toHaveTextContent("2軒見つかりました");
    vi.useRealTimers();
  });
});
