import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { Reveal } from "./Reveal";
import type { RevealVerb } from "./Reveal";
import { mockReducedMotion } from "./test-utils";

/** テスト用の IntersectionObserver。trigger() で「画面に入った」を起こす。 */
class FakeObserver {
  static instances: FakeObserver[] = [];
  readonly targets: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.instances.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  trigger(isIntersecting = true) {
    const entries = this.targets.map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry);
    this.callback(entries, this as unknown as IntersectionObserver);
  }
}

const BELOW = "is-below";

/** クラス is-below の要素は画面の下（上端 2000px）、ほかは画面の中（上端 100px）にあることにする。 */
function mockLayout() {
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const top = this.classList.contains(BELOW) ? 2000 : 100;
    return { top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40, x: 0, y: top, toJSON: () => ({}) } as DOMRect;
  });
}

function renderReveal(verb: RevealVerb, { below = true, delay, index }: { below?: boolean; delay?: number; index?: number } = {}) {
  const result = render(
    <Reveal verb={verb} delay={delay} index={index} className={below ? BELOW : undefined}>
      <button type="button">中の操作</button>
    </Reveal>,
  );
  const el = screen.getByRole("button", { name: "中の操作" }).parentElement as HTMLElement;
  return { ...result, el };
}

describe("Reveal", () => {
  beforeEach(() => {
    FakeObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", FakeObserver);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("サーバー描画は最終状態（data-reveal=done）で、verb を属性に持つ", () => {
    const html = renderToString(
      <Reveal verb="stick">
        <p>貼られる紙</p>
      </Reveal>,
    );
    expect(html).toContain('data-reveal="done"');
    expect(html).toContain('data-verb="stick"');
  });

  it("as で要素を選べる", () => {
    const { container } = render(
      <ul>
        <Reveal as="li" verb="stick">
          行
        </Reveal>
      </ul>,
    );
    expect(container.querySelector("li[data-reveal='done']")).not.toBeNull();
  });

  it("reduce なら画面の下の物も done のまま（見張らない）", () => {
    mockReducedMotion(true);
    mockLayout();
    const { el } = renderReveal("stamp");
    expect(el).toHaveAttribute("data-reveal", "done");
    expect(FakeObserver.instances).toHaveLength(0);
  });

  it("IntersectionObserver が無ければ done のまま", () => {
    mockReducedMotion(false);
    vi.stubGlobal("IntersectionObserver", undefined);
    mockLayout();
    const { el } = renderReveal("pop");
    expect(el).toHaveAttribute("data-reveal", "done");
  });

  it("マウントの時点で見えている物は done のまま（ちらつかせない）", () => {
    mockReducedMotion(false);
    mockLayout();
    const { el } = renderReveal("stick", { below: false });
    expect(el).toHaveAttribute("data-reveal", "done");
    expect(FakeObserver.instances).toHaveLength(0);
  });

  it("inView=\"parts\": 最初の画面に入っている物は、包みは透明にせず、遅れの後に中身だけ再生（parts）→ done", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    mockLayout();
    render(
      <Reveal verb="stick" inView="parts" inViewDelay={600} index={1}>
        <button type="button">中の操作</button>
      </Reveal>,
    );
    const el = screen.getByRole("button", { name: "中の操作" }).parentElement as HTMLElement;
    expect(el).toHaveAttribute("data-reveal", "parts");
    expect(el.style.getPropertyValue("--d")).toBe("645ms");
    expect(el).not.toHaveClass("verb-stick");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(el).toHaveAttribute("data-reveal", "done");
  });

  it("inView=\"parts\" はサーバー描画で pending（中身を再生前の状態で出し、ハイドレーションでちらつかせない）", () => {
    const html = renderToString(
      <Reveal verb="stick" inView="parts">
        <span>中身</span>
      </Reveal>,
    );
    expect(html).toContain('data-reveal="pending"');
  });

  it("inView=\"parts\" でも reduce なら done（最終状態）", () => {
    mockReducedMotion(true);
    mockLayout();
    render(
      <Reveal verb="stick" inView="parts" inViewDelay={600}>
        <button type="button">中の操作</button>
      </Reveal>,
    );
    expect(screen.getByRole("button", { name: "中の操作" }).parentElement).toHaveAttribute("data-reveal", "done");
  });

  it("画面の下の物は wait → 交差で play（verb のクラスと --d）→ animationend で done", () => {
    mockReducedMotion(false);
    mockLayout();
    const { el } = renderReveal("stick", { delay: 75, index: 2 });
    expect(el).toHaveAttribute("data-reveal", "wait");
    expect(el).not.toHaveClass("verb-stick");

    act(() => FakeObserver.instances[0].trigger());
    expect(el).toHaveAttribute("data-reveal", "play");
    expect(el).toHaveClass("verb-stick");
    expect(el.style.getPropertyValue("--d")).toBe(`${75 + 2 * 45}ms`);

    fireEvent.animationEnd(el);
    expect(el).toHaveAttribute("data-reveal", "done");
    expect(el).not.toHaveClass("verb-stick");

    // 一度 done になった物は二度と再生しない
    act(() => FakeObserver.instances[0].trigger());
    expect(el).toHaveAttribute("data-reveal", "done");
  });

  it("ずらしは 8個目で打ち止め", () => {
    mockReducedMotion(false);
    mockLayout();
    const { el } = renderReveal("stamp", { index: 12 });
    act(() => FakeObserver.instances[0].trigger());
    expect(el.style.getPropertyValue("--d")).toBe(`${7 * 45}ms`);
  });

  it("交差しないうちは再生しない", () => {
    mockReducedMotion(false);
    mockLayout();
    const { el } = renderReveal("ignite");
    act(() => FakeObserver.instances[0].trigger(false));
    expect(el).toHaveAttribute("data-reveal", "wait");
  });

  it("animationend が来なくても、保険のタイマーで done になる", () => {
    vi.useFakeTimers();
    mockReducedMotion(false);
    mockLayout();
    const { el } = renderReveal("pop");
    act(() => FakeObserver.instances[0].trigger());
    expect(el).toHaveAttribute("data-reveal", "play");
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(el).toHaveAttribute("data-reveal", "done");
  });

  it("中にフォーカスが入ったらすぐ done", () => {
    mockReducedMotion(false);
    mockLayout();
    const { el } = renderReveal("stick");
    expect(el).toHaveAttribute("data-reveal", "wait");
    act(() => screen.getByRole("button", { name: "中の操作" }).focus());
    expect(el).toHaveAttribute("data-reveal", "done");
    expect(FakeObserver.instances[0].disconnected).toBe(true);
  });

  it("親が描き直しても状態は戻らない", () => {
    mockReducedMotion(false);
    mockLayout();
    const { el, rerender } = renderReveal("stick");
    act(() => FakeObserver.instances[0].trigger());
    rerender(
      <Reveal verb="stick" className={BELOW}>
        <button type="button">中の操作</button>
      </Reveal>,
    );
    expect(el).toHaveAttribute("data-reveal", "play");
  });
});
