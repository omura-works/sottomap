import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StartScreen } from "./StartScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/app/actions/start", () => ({
  saveHomeCityAction: vi.fn(async () => undefined),
}));

const CITIES = [
  { slug: "sapporo", name: "札幌" },
  { slug: "otaru", name: "小樽" },
];

const DATA = {
  sapporo: {
    publishedCount: 5,
    recentlyVerified: [{ spotId: "s1", spotName: "札幌ザンギ本舗", verifierCount: 5 }],
  },
  otaru: { publishedCount: 3, recentlyVerified: [] },
};

/**
 * `window.matchMedia("(prefers-reduced-motion: reduce)")` を任意の初期値で差し替え、
 * `change` イベントを模擬発火できるようにする（vitest.setup.ts の既定スタブは常に matches:true
 * かつ addEventListener が no-op のため、このテストファイルでは個別に差し替える）。
 */
function mockReducedMotion(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const mql = {
    matches: initialMatches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;

  vi.spyOn(window, "matchMedia").mockReturnValue(mql);

  return {
    setMatches(next: boolean) {
      (mql as unknown as { matches: boolean }).matches = next;
      listeners.forEach((listener) => listener({ matches: next } as MediaQueryListEvent));
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("StartScreen（SPEC §9.15 案B）", () => {
  it("h1 はキャッチコピーで、街の選択と主ボタンがある", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    expect(screen.getByRole("heading", { level: 1, name: "北海道の、まだ静かな店を歩く" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "どの街を歩きますか" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "歩きはじめる" })).toBeInTheDocument();
    // §9.15: 「歩きかたを選ぶ（昼／夜／朝）」は置かない
    expect(screen.queryByText("歩きかたを選ぶ")).not.toBeInTheDocument();
  });

  it("街を切り替えると、件数と今週確認された店が切り替わる", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    expect(screen.getByRole("button", { name: "札幌" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("札幌には、地元が確認したピンが")).toBeInTheDocument();
    expect(screen.getByText("札幌ザンギ本舗")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "小樽" }));

    expect(screen.getByRole("button", { name: "小樽" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("小樽には、地元が確認したピンが")).toBeInTheDocument();
    expect(screen.getByText("今週はまだ確認がありません。")).toBeInTheDocument();
  });

  it("§1 の思想を3つの手順として示す", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    expect(screen.getByRole("heading", { level: 2, name: "静けさは、こうして保たれます" })).toBeInTheDocument();
    expect(screen.getByText("同じ街の2人が『行ったことがある』と答えると、地図に出ます")).toBeInTheDocument();
    expect(screen.getByText("90日ごとに、あなたに一度だけ確認が届きます")).toBeInTheDocument();
  });

  // Codex R8 重要4・軽微1: 5秒を超える自動運動（灯り・手順巡回）を止める手段（WCAG 2.2.2）。
  describe("動きを止める", () => {
    it("reduced motion では最初から止まった状態で表示される", async () => {
      mockReducedMotion(true);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      const toggle = await screen.findByRole("button", { name: "動きを再開する" });
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("ボタンで手順の巡回が止まる・再開する", () => {
      mockReducedMotion(false);
      vi.useFakeTimers();
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      const stepsList = screen.getByRole("heading", { name: "静けさは、こうして保たれます" }).closest("section")!;
      const steps = within(stepsList).getAllByRole("listitem");
      expect(steps[0]).toHaveStyle({ background: "var(--color-accent-100)" });

      act(() => {
        vi.advanceTimersByTime(2800);
      });
      expect(steps[1]).toHaveStyle({ background: "var(--color-accent-100)" });

      const toggle = screen.getByRole("button", { name: "動きを止める" });
      expect(toggle).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(toggle);
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");

      act(() => {
        vi.advanceTimersByTime(2800);
      });
      // 止めている間は手順が進まない（1のまま）。
      expect(steps[1]).toHaveStyle({ background: "var(--color-accent-100)" });
      expect(steps[2]).toHaveStyle({ background: "var(--color-neutral-100)" });

      fireEvent.click(screen.getByRole("button", { name: "動きを再開する" }));
      act(() => {
        vi.advanceTimersByTime(2800);
      });
      expect(steps[2]).toHaveStyle({ background: "var(--color-accent-100)" });
    });

    it("表示中に matchMedia の設定が変わっても追従する", () => {
      const control = mockReducedMotion(false);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      expect(screen.getByRole("button", { name: "動きを止める" })).toHaveAttribute("aria-pressed", "false");

      act(() => {
        control.setMatches(true);
      });

      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("軽微1: 街を切り替えたときの件数の文章はライブリージョンで知らせる", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    const liveRegion = screen.getByText("札幌には、地元が確認したピンが").closest('[aria-live="polite"]');
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
  });
});
