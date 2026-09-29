import { afterEach, describe, expect, it, vi } from "vitest";
import { RAIL_WIDTH, setIrisOrigin } from "./iris";

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

function element(r: DOMRect): Element {
  const el = document.createElement("button");
  el.getBoundingClientRect = () => r;
  return el;
}

function desktop(matches: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation((query: string) => ({ matches: query.includes("min-width: 1024px") ? matches : false, media: query }) as MediaQueryList);
}

const style = () => document.documentElement.style;

describe("setIrisOrigin（SPEC motion §4.2.4）", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelector("[data-demo-banner]")?.remove();
    delete document.documentElement.dataset.nav;
    delete document.documentElement.dataset.navFresh;
  });

  it("スマホ: 押した要素の中心をそのまま書き、半径は画面のいちばん遠い角まで＋24px", () => {
    desktop(false);
    setIrisOrigin(element(rect(100, 200, 200, 50)));
    expect(style().getPropertyValue("--iris-x")).toBe("200px");
    expect(style().getPropertyValue("--iris-y")).toBe("225px");
    // jsdom の画面は 1024×768。(200,225) から (1024,768) まで hypot(824,543) ≈ 986.8 → 987 ＋ 24
    expect(style().getPropertyValue("--iris-r")).toBe("1011px");
  });

  it("PC: 左ナビの幅（88px）を引いた、新しいページの箱の中の座標", () => {
    desktop(true);
    expect(RAIL_WIDTH).toBe(88);
    setIrisOrigin(element(rect(500, 300, 100, 40)));
    expect(style().getPropertyValue("--iris-x")).toBe(`${550 - 88}px`);
    expect(style().getPropertyValue("--iris-y")).toBe("320px");
    // 箱の幅は 1024 − 88 = 936。(462,320) から (0,768) まで hypot(462,448) ≈ 643.5 と (936,768) まで hypot(474,448) ≈ 652.2 → 653 ＋ 24
    expect(style().getPropertyValue("--iris-r")).toBe("677px");
  });

  it("デモの帯は、画面に見えている分（下端の位置）だけ引き、スクロールして見えなければ引かない", () => {
    desktop(false);
    const banner = document.createElement("p");
    banner.dataset.demoBanner = "";
    document.body.appendChild(banner);
    banner.getBoundingClientRect = () => rect(0, 0, 1024, 24);
    setIrisOrigin(element(rect(100, 200, 200, 50)));
    expect(style().getPropertyValue("--iris-y")).toBe(`${225 - 24}px`);
    banner.getBoundingClientRect = () => rect(0, -300, 1024, 24);
    setIrisOrigin(element(rect(100, 200, 200, 50)));
    expect(style().getPropertyValue("--iris-y")).toBe("225px");
  });

  it("アイリスの遷移を始めた印（html[data-nav=lamp-iris]）を付ける", () => {
    desktop(false);
    setIrisOrigin(element(rect(0, 0, 10, 10)));
    expect(document.documentElement.dataset.nav).toBe("lamp-iris");
    expect(document.documentElement.dataset.navFresh).toBe("1");
  });
});
