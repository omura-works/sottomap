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
    // Codex R10 重要3: SSR・マウント直後（matchMediaをまだ読んでいない間）は
    // data-motion="auto" を出す（"paused"/"playing" は利用者が押したとき、または
    // OS設定を読んだ後だけ）。ハイドレーション不一致・JS実行前の誤動作を避けるため。
    it("マウント直後（matchMedia解決前）はdata-motion=autoで、ボタンは「動きを止める」表示", () => {
      mockReducedMotion(false);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      // queueMicrotaskでの解決前の同期的な初回描画を確認する。
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "auto");
      expect(screen.getByRole("button", { name: "動きを止める" })).toHaveAttribute("aria-pressed", "false");
    });

    // Codex R10 重要3: OS設定を実際に false→true→false と変化させても、
    // 手動停止した後はOS設定に関係なくずっと停止のまま。
    it("OS設定がfalse→true→falseと変化しても、手動停止した後はずっと停止のまま", async () => {
      const control = mockReducedMotion(false);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      await screen.findByRole("button", { name: "動きを止める" });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "playing");

      act(() => {
        control.setMatches(true);
      });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");

      // 利用者が明示的に停止を選ぶ。
      fireEvent.click(screen.getByRole("button", { name: "動きを再開する" }));
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "playing");
      fireEvent.click(screen.getByRole("button", { name: "動きを止める" }));
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");

      act(() => {
        control.setMatches(false);
      });
      // OS設定がfalseに戻っても、利用者の選択（停止）が優先される。
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");
    });

    it("reduced motion では最初から止まった状態で表示される", async () => {
      mockReducedMotion(true);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      const toggle = await screen.findByRole("button", { name: "動きを再開する" });
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("ボタンで手順の巡回が止まる・再開する", async () => {
      mockReducedMotion(false);
      vi.useFakeTimers();
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);
      // Codex R10 重要3: 手順の自動巡回はマウント後にmatchMediaを読んでから開始するため、
      // その解決（マイクロタスク）を一度フラッシュしてから進める。
      await act(async () => {
        await Promise.resolve();
      });

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

    // Codex R9 重要4: 利用者の明示的な選択（userChoice）はOS設定の変化で上書きされない。
    it("手動停止後にOS設定がreduce:falseへ変わっても停止のまま", () => {
      const control = mockReducedMotion(false);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      fireEvent.click(screen.getByRole("button", { name: "動きを止める" }));
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");

      act(() => {
        control.setMatches(false);
      });

      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");
    });

    it("OSがreduceのままでも「動きを再開する」を押すとdata-motion=playingになる", async () => {
      mockReducedMotion(true);
      render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

      const toggle = await screen.findByRole("button", { name: "動きを再開する" });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");

      fireEvent.click(toggle);

      expect(screen.getByRole("button", { name: "動きを止める" })).toHaveAttribute("aria-pressed", "false");
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "playing");
    });
  });

  it("軽微1: 街を切り替えたときの件数の文章はライブリージョンで知らせる", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    const liveRegion = screen.getByText("札幌には、地元が確認したピンが").closest('[aria-live="polite"]');
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
  });

  it("R13レビュー重要4: 街が0件でも落ちず、空状態を表示する（選択・開始UIは出さない）", () => {
    render(<StartScreen cities={[]} dataBySlug={{}} defaultCitySlug="sapporo" />);

    expect(screen.getByText("まだ街が準備されていません。しばらくしてからもう一度お試しください。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "歩きはじめる" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "どの街を歩きますか" })).not.toBeInTheDocument();
  });
});
