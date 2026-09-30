import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartScreen } from "./StartScreen";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  save: vi.fn<(slug: string) => Promise<void>>(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/app/actions/start", () => ({
  saveHomeCityAction: (slug: string) => mocks.save(slug),
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

function renderStart() {
  return render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.save.mockReset();
  mocks.save.mockImplementation(async () => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("StartScreen（SPEC motion §5.1）", () => {
  it("h1 はキャッチコピーを1回だけ読み、見た目の3段は読み上げない", () => {
    renderStart();
    const h1 = screen.getByRole("heading", { level: 1, name: "北海道の、まだ静かな店を歩く" });
    expect(h1.querySelector(".sr-only")).toHaveTextContent("北海道の、まだ静かな店を歩く");
    expect(h1.querySelector(".start-h1-vis")).toHaveAttribute("aria-hidden", "true");
    // 「歩」「く」は跳ねるために1字ずつ分ける
    expect(h1.querySelectorAll(".start-h1-r3 .start-ch")).toHaveLength(2);
  });

  it("キッカー・リード・街を選ぶ見出し・主ボタンの文言", () => {
    renderStart();
    expect(screen.getByText("北海道・8つの街")).toBeInTheDocument();
    expect(
      screen.getByText("その街に住んでいる人が「ここ、いいよ」って残した店だけ。まだ静かなところから、いっしょに歩いてみませんか。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "どの街を歩く？" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "札幌を歩いてみる" })).toBeInTheDocument();
    expect(screen.getByText("無料。ログインしなくても地図は見られます。")).toBeInTheDocument();
    // §9.15: 「歩きかたを選ぶ（昼／夜／朝）」は置かない
    expect(screen.queryByText("歩きかたを選ぶ")).not.toBeInTheDocument();
  });

  it("ページの灯りは1つ（夜の面の上）", () => {
    const { container } = renderStart();
    const lamps = container.querySelectorAll(".page-lamp");
    expect(lamps).toHaveLength(1);
    expect(lamps[0]).toHaveAttribute("data-tone", "night");
  });

  it("街を切り替えると、件数の文・今週の店・主ボタンの街の名前が切り替わる", async () => {
    renderStart();
    expect(screen.getByRole("button", { name: "札幌" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("札幌で、地元の人がたしかめて残した店の数です。")).toBeInTheDocument();
    expect(screen.getByText("札幌ザンギ本舗")).toBeInTheDocument();
    expect(screen.getByText("地元の 5人がたしかめました")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "小樽" }));

    expect(screen.getByRole("button", { name: "小樽" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "札幌" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("小樽で、地元の人がたしかめて残した店の数です。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "小樽を歩いてみる" })).toBeInTheDocument();
    expect(await screen.findByText("今週は、まだだれもたしかめていないみたい。")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("札幌ザンギ本舗")).not.toBeInTheDocument());
  });

  it("件数の文はライブリージョン（polite・atomic）で、街を替えると文全体が読まれる", () => {
    renderStart();
    const liveRegion = screen.getByText("札幌で、地元の人がたしかめて残した店の数です。").closest('[aria-live="polite"]');
    expect(liveRegion).toHaveAttribute("aria-atomic", "true");
    expect(liveRegion).toHaveTextContent("5");
    expect(liveRegion).toHaveTextContent("軒");
  });

  it("北海道の小さな地図は飾り（aria-hidden）で、選んだ街に灯りがある", () => {
    const { container } = renderStart();
    const map = container.querySelector(".hokkaido-map") as HTMLElement;
    expect(map).toHaveAttribute("aria-hidden", "true");
    const lamp = map.querySelector<HTMLElement>(".hokkaido-lamp");
    expect(lamp?.style.getPropertyValue("--x")).toBe("140");
    expect(lamp?.style.getPropertyValue("--y")).toBe("238");
    fireEvent.click(screen.getByRole("button", { name: "小樽" }));
    const moved = container.querySelector<HTMLElement>(".hokkaido-map .hokkaido-lamp");
    expect(moved?.style.getPropertyValue("--x")).toBe("115");
    expect(moved?.style.getPropertyValue("--y")).toBe("228");
  });

  it("主ボタンは街を保存し、押した所を中心に lamp-iris で地図へ移る", async () => {
    renderStart();
    const button = screen.getByRole("button", { name: "札幌を歩いてみる" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(mocks.save).toHaveBeenCalledWith("sapporo");
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/sapporo", { transitionTypes: ["lamp-iris"] }));
    expect(document.documentElement.style.getPropertyValue("--iris-x")).toMatch(/px$/);
    expect(document.documentElement.style.getPropertyValue("--iris-y")).toMatch(/px$/);
  });

  it("アイリスの中心と半径: 押したボタンの中心（左ナビ・デモの帯が無ければそのまま）と、そこから画面のいちばん遠い角まで", async () => {
    renderStart();
    const button = screen.getByRole("button", { name: "札幌を歩いてみる" });
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left: 100, top: 200, width: 200, height: 50, right: 300, bottom: 250, x: 100, y: 200, toJSON: () => ({}) } as DOMRect);
    await act(async () => {
      fireEvent.click(button);
    });
    const style = document.documentElement.style;
    expect(style.getPropertyValue("--iris-x")).toBe("200px");
    expect(style.getPropertyValue("--iris-y")).toBe("225px");
    // jsdom の画面は 1024×768。いちばん遠い角 (1024, 768) まで hypot(824, 543) ≈ 986.8 → 切り上げ 987 ＋ 24
    expect(style.getPropertyValue("--iris-r")).toBe("1011px");
    expect(document.documentElement.dataset.nav).toBe("lamp-iris");
  });

  it("今週の店: 最初の表示では行を動かさず、街を替えたときだけ行の灯りが灯る", () => {
    mockReducedMotion(false);
    const data = {
      sapporo: DATA.sapporo,
      otaru: { publishedCount: 3, recentlyVerified: [{ spotId: "o1", spotName: "南樽市場", verifierCount: 2 }] },
    };
    const { container } = render(<StartScreen cities={CITIES} dataBySlug={data} defaultCitySlug="sapporo" />);
    const firstDot = container.querySelector(".start-weekly-dot");
    expect(firstDot).not.toHaveClass("verb-ignite");
    fireEvent.click(screen.getByRole("button", { name: "小樽" }));
    const newRow = screen.getByText("南樽市場").closest("li")!;
    expect(newRow.querySelector(".start-weekly-dot")).toHaveClass("verb-ignite");
  });

  it("保存に失敗したら、やわらかい言い方のエラーを alert で出す", async () => {
    mocks.save.mockImplementation(async () => {
      throw new Error("network");
    });
    renderStart();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "札幌を歩いてみる" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("ごめんなさい、街を保存できませんでした。もう一度押してみてください。");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("やくそくの3枚（題はやわらげた文、文は §1 の原文）と、ピンの字の凡例", () => {
    renderStart();
    expect(screen.getByText("そっとマップのやくそく")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "静かな店を、静かなままに" })).toBeInTheDocument();
    expect(screen.getByText("ガイドブックじゃなくて、地元の人のこっそりメモ帳みたいなもの。")).toBeInTheDocument();
    const list = screen.getByRole("heading", { level: 2, name: "静かな店を、静かなままに" }).closest("section")!.querySelector("ol")!;
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByRole("heading", { level: 3 })).toHaveTextContent("ピンを立てられるのは、その街に住んでいる人だけ");
    expect(within(items[1]).getByRole("heading", { level: 3 })).toHaveTextContent("「行ったことある！」が2人そろうと、地図にぽん");
    expect(within(items[2]).getByRole("heading", { level: 3 })).toHaveTextContent("90日ごとに「まだ静か？」");
    expect(screen.getByText("掲載しているのは実在の店名と、公開情報にある事実だけ")).toBeInTheDocument();
    expect(screen.getByText("同じ街の2人が『行ったことがある』と答えると、地図に出ます")).toBeInTheDocument();
    expect(screen.getByText("90日ごとに、あなたに一度だけ確認が届きます")).toBeInTheDocument();

    expect(screen.getByRole("heading", { level: 2, name: "ピンの字を見てみよう" })).toBeInTheDocument();
    for (const text of ["静かなまま", "並びはじめた", "もう観光地になった", "並と観の店は、さがすときに下のほうへ静かに下がります。"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("画面の外の節（やくそく・凡例）は最初から DOM に中身があり、JS で隠さない（content-visibility: auto は CSS だけ）", () => {
    const { container } = renderStart();
    const trail = container.querySelector(".start-trail") as HTMLElement;
    // 中身は最初から DOM にある（読み上げ・検索・JS 無しでも読める）
    expect(trail).toHaveTextContent("静かな店を、静かなままに");
    expect(trail).not.toHaveAttribute("data-deferred");
  });

  it("手順の自動巡回はしない（時間がたっても、やくそくのカードの見た目は変わらない）", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { container } = renderStart();
    const before = container.querySelector(".start-pcards")!.innerHTML;
    act(() => {
      vi.advanceTimersByTime(9000);
    });
    expect(container.querySelector(".start-pcards")!.innerHTML).toBe(before);
  });

  // Codex R8 重要4・軽微1: 5秒を超える自動運動（灯りの明滅）を止める手段（WCAG 2.2.2）。
  describe("動きを止める", () => {
    it("マウント直後（matchMedia解決前）はdata-motion=autoで、ボタンは「動きを止める」表示", () => {
      mockReducedMotion(false);
      renderStart();
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "auto");
      expect(screen.getByRole("button", { name: "動きを止める" })).toHaveAttribute("aria-pressed", "false");
    });

    it("夜の灯りの点には今のクラス .start-light が残っている（e2e/start-motion.spec.ts が見る）", () => {
      const { container } = renderStart();
      expect(container.querySelectorAll(".start-hero .start-light")).toHaveLength(16);
    });

    it("OS設定がfalse→true→falseと変化しても、手動停止した後はずっと停止のまま", async () => {
      const control = mockReducedMotion(false);
      renderStart();

      await screen.findByRole("button", { name: "動きを止める" });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "playing");

      act(() => {
        control.setMatches(true);
      });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");

      fireEvent.click(screen.getByRole("button", { name: "動きを再開する" }));
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "playing");
      fireEvent.click(screen.getByRole("button", { name: "動きを止める" }));
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");

      act(() => {
        control.setMatches(false);
      });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");
    });

    it("reduced motion では最初から止まった状態で表示される", async () => {
      mockReducedMotion(true);
      renderStart();
      const toggle = await screen.findByRole("button", { name: "動きを再開する" });
      expect(toggle).toHaveAttribute("aria-pressed", "true");
    });

    it("表示中に matchMedia の設定が変わっても追従する", () => {
      const control = mockReducedMotion(false);
      renderStart();
      expect(screen.getByRole("button", { name: "動きを止める" })).toHaveAttribute("aria-pressed", "false");
      act(() => {
        control.setMatches(true);
      });
      expect(screen.getByRole("button", { name: "動きを再開する" })).toHaveAttribute("aria-pressed", "true");
    });

    // Codex R9 重要4: 利用者の明示的な選択（userChoice）はOS設定の変化で上書きされない。
    it("手動停止後にOS設定がreduce:falseへ変わっても停止のまま", () => {
      const control = mockReducedMotion(false);
      renderStart();
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
      renderStart();
      const toggle = await screen.findByRole("button", { name: "動きを再開する" });
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "paused");
      fireEvent.click(toggle);
      expect(screen.getByRole("button", { name: "動きを止める" })).toHaveAttribute("aria-pressed", "false");
      expect(document.querySelector(".start-screen")).toHaveAttribute("data-motion", "playing");
    });
  });

  it("R13レビュー重要4・§4.6: 街が0件でも落ちず、空状態を表示する（選択・開始UIは出さない）", () => {
    render(<StartScreen cities={[]} dataBySlug={{}} defaultCitySlug="sapporo" />);
    expect(screen.getByText("まだ街の準備中です")).toBeInTheDocument();
    expect(screen.getByText("しばらくしてから、もう一度のぞいてみてください。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /を歩いてみる$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "どの街を歩く？" })).not.toBeInTheDocument();
  });

  it("R14暫定レビュー軽微8: 街が0件の空状態にも h1 を付け、main は AppShell に任せて重ねない", () => {
    render(<StartScreen cities={[]} dataBySlug={{}} defaultCitySlug="sapporo" />);
    expect(screen.getByRole("heading", { level: 1, name: "そっとマップ" })).toBeInTheDocument();
    expect(screen.queryByRole("main")).not.toBeInTheDocument();
  });
});
