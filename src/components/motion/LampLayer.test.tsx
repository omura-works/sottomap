import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { useEffect } from "react";
import { LampLayer, LampProvider, MAX_FLYING, arcKeyframes, useLamp } from "./LampLayer";
import type { LampApi } from "./LampLayer";
import { mockReducedMotion } from "./test-utils";

/** useLamp() の API を外へ取り出す。 */
function Grab({ onApi }: { onApi: (api: LampApi) => void }) {
  const api = useLamp();
  useEffect(() => {
    onApi(api);
  }, [api, onApi]);
  return null;
}

function renderWithLayer() {
  let api: LampApi | null = null;
  const result = render(
    <LampProvider>
      <Grab onApi={(value) => (api = value)} />
      <LampLayer />
    </LampProvider>,
  );
  if (!api) throw new Error("API が取れない");
  const layer = result.container.querySelector(".lamp-layer") as HTMLElement;
  return { api: api as LampApi, layer, ...result };
}

/** 終わらない WAAPI のアニメーション（飛んでいる途中のまま）。 */
function stubAnimate() {
  const animate = vi.fn(() => ({ finished: new Promise<Animation>(() => {}), cancel: () => {} }) as unknown as Animation);
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
  return animate;
}

function unstubAnimate() {
  // jsdom の Element.prototype には animate が無い（元に戻す）
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
}

describe("灯りの層", () => {
  afterEach(() => {
    unstubAnimate();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("Provider 無しの useLamp() は何も飛ばさず、onArrive だけをすぐ呼ぶ", () => {
    let api: LampApi | null = null;
    render(<Grab onApi={(value) => (api = value)} />);
    const onArrive = vi.fn();
    const target = document.createElement("div");
    (api as unknown as LampApi).fly({ x: 0, y: 0 }, target, { onArrive });
    expect(onArrive).toHaveBeenCalledTimes(1);
    expect((api as unknown as LampApi).target("bookmarks")).toBeNull();
    expect(() => (api as unknown as LampApi).bump(target)).not.toThrow();
  });

  it("灯りの層は飾りで、押せず、遷移の名前 lamp-layer を持つ", () => {
    const { layer } = renderWithLayer();
    expect(layer).toHaveAttribute("aria-hidden", "true");
    expect(layer.style.viewTransitionName).toBe("lamp-layer");
  });

  it("Element.prototype.animate が無い（jsdom）ときは飛ばず、onArrive をすぐ呼ぶ", () => {
    mockReducedMotion(false);
    const { api, layer } = renderWithLayer();
    const onArrive = vi.fn();
    api.fly({ x: 10, y: 10 }, { x: 200, y: 300 }, { onArrive });
    expect(onArrive).toHaveBeenCalledTimes(1);
    expect(layer.childElementCount).toBe(0);
  });

  it("reduce のときは飛ばず、onArrive をすぐ呼ぶ", () => {
    mockReducedMotion(true);
    stubAnimate();
    const { api, layer } = renderWithLayer();
    const onArrive = vi.fn();
    api.fly({ x: 10, y: 10 }, { x: 200, y: 300 }, { onArrive, kind: "ribbon" });
    expect(onArrive).toHaveBeenCalledTimes(1);
    expect(layer.childElementCount).toBe(0);
  });

  it("reduce で行き先が要素なら、飛ばずにその場で 120ms 明るくなってから onArrive", async () => {
    mockReducedMotion(true);
    let finish: () => void = () => {};
    const animate = vi.fn(
      (...args: [Keyframe[], KeyframeAnimationOptions]) =>
        args &&
        ({ finished: new Promise<Animation>((resolve) => (finish = () => resolve({} as Animation))) }) as unknown as Animation,
    );
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
    const { api, layer } = renderWithLayer();
    const target = document.createElement("span");
    document.body.appendChild(target);
    const onArrive = vi.fn();
    api.fly({ x: 10, y: 10 }, target, { onArrive, kind: "ribbon" });
    expect(layer.childElementCount).toBe(0);
    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.instances[0]).toBe(target);
    expect(animate.mock.calls[0][0]).toEqual([{ opacity: 0.4 }, { opacity: 1 }]);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 120 });
    expect(onArrive).not.toHaveBeenCalled();
    await act(async () => finish());
    expect(onArrive).toHaveBeenCalledTimes(1);
    target.remove();
  });

  it("同時に飛ぶのは 8 つまで。9 個目は飛ばず onArrive だけ呼ぶ", async () => {
    mockReducedMotion(false);
    const animate = stubAnimate();
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const { api, layer } = renderWithLayer();
    const arrivals: number[] = [];
    act(() => {
      for (let i = 0; i < MAX_FLYING + 1; i++) {
        api.fly({ x: 0, y: 0 }, { x: 100, y: 100 }, { kind: i % 2 ? "lamp" : "stamp", glyph: "静", tone: "quiet", onArrive: () => arrivals.push(i) });
      }
    });
    expect(layer.childElementCount).toBe(MAX_FLYING);
    expect(arrivals).toEqual([MAX_FLYING]);
    // 移動と、見え方（待つ間は見えず、着いたら消える）の2つずつ
    expect(animate).toHaveBeenCalledTimes(MAX_FLYING * 2);
    const stamp = layer.querySelector(".lamp-fly[data-kind='stamp'] .stamp");
    expect(stamp).toHaveAttribute("data-tone", "quiet");
    expect(stamp).toHaveTextContent("静");
  });

  it("着いたら onArrive を呼び、消えたら層から取り除く", async () => {
    mockReducedMotion(false);
    let resolveMove: () => void = () => {};
    let resolveFade: () => void = () => {};
    const animate = vi.fn((keyframes: Keyframe[]) => {
      const isFade = keyframes.some((frame) => "opacity" in frame);
      const finished = new Promise<Animation>((resolve) => {
        if (isFade) resolveFade = () => resolve({} as Animation);
        else resolveMove = () => resolve({} as Animation);
      });
      return { finished } as unknown as Animation;
    });
    Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    const { api, layer } = renderWithLayer();
    const onArrive = vi.fn();
    api.fly({ x: 0, y: 0 }, { x: 100, y: 0 }, { onArrive });
    expect(layer.childElementCount).toBe(1);
    expect(onArrive).not.toHaveBeenCalled();
    await act(async () => resolveMove());
    expect(onArrive).toHaveBeenCalledTimes(1);
    await act(async () => resolveFade());
    expect(layer.childElementCount).toBe(0);
  });

  it("target() は幅 0 の要素を返さず、候補が複数なら起点に近い物を返す", () => {
    const { api } = renderWithLayer();
    const make = (left: number, width: number) => {
      const el = document.createElement("span");
      el.dataset.lampTarget = "bookmarks";
      el.getBoundingClientRect = () => ({ left, top: 0, width, height: 36, right: left + width, bottom: 36, x: left, y: 0, toJSON: () => ({}) }) as DOMRect;
      document.body.appendChild(el);
      return el;
    };
    const hidden = make(0, 0);
    const far = make(900, 36);
    const near = make(100, 36);
    expect(api.target("bookmarks", { x: 110, y: 10 })).toBe(near);
    expect(api.target("bookmarks", { x: 950, y: 10 })).toBe(far);
    expect(api.target("bookmarks", { x: 0, y: 0 })).not.toBe(hidden);
    expect(api.target("keeper-bar")).toBeNull();
    hidden.remove();
    far.remove();
    near.remove();
  });

  it("弧は中点を上へ min(80px, 距離×0.3) 持ち上げ、真ん中で 0.7 倍になる", () => {
    const frames = arcKeyframes({ x: 0, y: 200 }, { x: 400, y: 200 });
    expect(frames[0]).toMatchObject({ translate: "0.0px 200.0px", scale: "1.000" });
    expect(frames[frames.length - 1]).toMatchObject({ translate: "400.0px 200.0px", scale: "1.000" });
    const middle = frames[Math.floor(frames.length / 2)];
    expect(middle).toMatchObject({ translate: "200.0px 120.0px", scale: "0.700" });
  });
});
