import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen } from "./LoadingScreen";
import { STAGGER_MAX_INDEX, STAGGER_ROW_MS, STAGGER_STEP_MS, useIntroStagger } from "./useIntroStagger";

/** vitest.setup.ts の既定（常に reduce）を、このテストでだけ任意の値に差し替える。 */
function mockReducedMotion(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? matches : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function Rows({ ids }: { ids: string[] }) {
  const rowMotion = useIntroStagger(ids);
  return (
    <ul>
      {ids.map((id) => {
        const motion = rowMotion(id);
        return (
          <li key={id} data-testid={id} className={motion?.className} style={motion?.style}>
            {id}
          </li>
        );
      })}
    </ul>
  );
}

const TEN = Array.from({ length: 10 }, (_, i) => `row-${i}`);

describe("リスト順次表示（useIntroStagger）", () => {
  it("初回表示の行に順次表示のクラスと遅延の番号を付け、8行目で遅延を打ち止めにする", () => {
    mockReducedMotion(false);
    render(<Rows ids={TEN} />);
    expect(screen.getByTestId("row-0")).toHaveClass("motion-stagger-item");
    expect(screen.getByTestId("row-0").style.getPropertyValue("--stagger-index")).toBe("0");
    expect(screen.getByTestId("row-3").style.getPropertyValue("--stagger-index")).toBe("3");
    expect(screen.getByTestId("row-9").style.getPropertyValue("--stagger-index")).toBe(String(STAGGER_MAX_INDEX));
  });

  it("reduced-motion のときは動きのクラスもスタイルも付かない", () => {
    mockReducedMotion(true);
    render(<Rows ids={TEN} />);
    for (const id of TEN) {
      const row = screen.getByTestId(id);
      expect(row).not.toHaveClass("motion-stagger-item");
      expect(row.style.getPropertyValue("--stagger-index")).toBe("");
    }
  });

  it("再生後はクラスを外し、並び替え・絞り込みで増えた行では再生しない", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    const { rerender } = render(<Rows ids={["a", "b"]} />);
    // 初回表示の直後に増えた行（初回の並びに無い行）には付けない。
    rerender(<Rows ids={["a", "b", "c"]} />);
    expect(screen.getByTestId("c")).not.toHaveClass("motion-stagger-item");
    // 全体の再生（600 + 7×45 = 915ms、SPEC motion §3.5）が終わった後
    act(() => {
      vi.advanceTimersByTime(STAGGER_ROW_MS + STAGGER_STEP_MS * STAGGER_MAX_INDEX + 200);
    });
    expect(screen.getByTestId("a")).not.toHaveClass("motion-stagger-item");
    rerender(<Rows ids={["b", "a"]} />);
    expect(screen.getByTestId("a")).not.toHaveClass("motion-stagger-item");
    expect(screen.getByTestId("b")).not.toHaveClass("motion-stagger-item");
  });

  it("Codex R20 重要6: 一覧から消えた行が再生時間内に戻っても再生しない（栞のロールバック相当）", () => {
    mockReducedMotion(false);
    const { rerender } = render(<Rows ids={["a", "b", "c"]} />);
    // 削除の楽観的更新で b が消える。
    rerender(<Rows ids={["a", "c"]} />);
    // 失敗してロールバックし、まだ全体の再生時間内に b が戻る。
    rerender(<Rows ids={["a", "b", "c"]} />);
    expect(screen.getByTestId("b")).not.toHaveClass("motion-stagger-item");
  });

  it("初回描画で行が無ければ、最初に行がそろった表示を初回表示として扱う", () => {
    mockReducedMotion(false);
    const { rerender } = render(<Rows ids={[]} />);
    rerender(<Rows ids={["x", "y"]} />);
    expect(screen.getByTestId("x")).toHaveClass("motion-stagger-item");
    expect(screen.getByTestId("y").style.getPropertyValue("--stagger-index")).toBe("1");
  });
});

// SPEC motion §4.5: 光の帯（.motion-skeleton）をやめ、点線の「地図帳の下書き」と呼吸する灯りにした。
describe("地図帳の下書き（LoadingScreen）", () => {
  it("aria-busy と「読み込んでいます」の読み上げは今のまま、骨格は aria-hidden", () => {
    const { container } = render(<LoadingScreen />);
    expect(container.querySelector("[data-page-root] > [aria-busy]")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("読み込んでいます");
    const skeleton = screen.getByTestId("loading-skeleton");
    expect(skeleton).toHaveAttribute("aria-hidden", "true");
  });

  it("骨格は点線の枠（見出し1本・サムネ付きの行3本）で、光の帯は無い", () => {
    render(<LoadingScreen />);
    const skeleton = screen.getByTestId("loading-skeleton");
    expect(skeleton.querySelector(".loading-draft-title")).not.toBeNull();
    expect(skeleton.querySelectorAll(".loading-draft-row")).toHaveLength(3);
    expect(skeleton.querySelectorAll(".loading-draft-thumb")).toHaveLength(3);
    expect(skeleton.querySelector(".motion-skeleton")).toBeNull();
  });

  it("ページの灯りが1つだけあり、「灯りをつけています…」は読み上げない", () => {
    const { container } = render(<LoadingScreen label="店を読み込んでいます" />);
    expect(container.querySelectorAll(".page-lamp")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("店を読み込んでいます");
    expect(screen.getByText("灯りをつけています…").closest("[aria-hidden='true']")).not.toBeNull();
  });
});

describe("globals.css の reduced-motion", () => {
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
  const reducedBlock = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));

  it.each([".motion-stagger-item", ".map-pin-halo", ".motion-accordion::details-content"])(
    "%s の動きを reduced-motion で止める",
    (selector) => {
      expect(reducedBlock).toContain(selector);
    },
  );

  it("ロード中の灯りは4周で静止、ハローは900msで1回だけ、アコーディオンは620ms", () => {
    // Codex R20 重要7: WCAG 2.2.2（自動更新の一時停止）。無限ループにせず4周（1200ms×4＝4.8秒）で静止させる。
    expect(css).toMatch(/\.loading-draft-head \.page-lamp \{\s*animation: v-breath 1200ms var\(--ease-breath\) 400ms 4;/);
    expect(css).not.toMatch(/v-breath[^;]*infinite/);
    const firstReduce = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(firstReduce).toContain(".loading-draft-head .page-lamp");
    expect(css).toMatch(/animation: map-pin-halo 900ms [^;]* 1 forwards/);
    expect(css).toContain("block-size 620ms");
  });
});
