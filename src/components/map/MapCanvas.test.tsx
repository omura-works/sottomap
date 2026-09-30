import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReducedMotion } from "@/components/motion/test-utils";
import type { MapPin } from "./MapCanvas";

// maplibre-gl（WebGL）は jsdom で動かないので、MapCanvas が使う分だけの偽物に替える。
type Handler = (...args: unknown[]) => void;
const maps: FakeMap[] = [];
class FakeMap {
  loaded = false;
  moving = false;
  private handlers = new Map<string, Set<Handler>>();
  constructor() {
    maps.push(this);
  }
  on(event: string, fn: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return this;
  }
  once(event: string, fn: Handler) {
    const wrapped: Handler = (...args) => {
      this.off(event, wrapped);
      fn(...args);
    };
    return this.on(event, wrapped);
  }
  off(event: string, fn: Handler) {
    this.handlers.get(event)?.delete(fn);
    return this;
  }
  fire(event: string) {
    if (event === "load") this.loaded = true;
    for (const fn of Array.from(this.handlers.get(event) ?? [])) fn();
  }
  isMoving() {
    return this.moving;
  }
  isStyleLoaded() {
    return this.loaded;
  }
  addControl() {}
  project() {
    return { x: 0, y: 0 };
  }
  resize() {}
  remove() {}
  jumpTo() {}
  fitBounds() {}
}
class FakeMarker {
  private el: HTMLElement;
  constructor({ element }: { element: HTMLElement }) {
    this.el = element;
  }
  setLngLat() {
    return this;
  }
  addTo() {
    document.body.appendChild(this.el);
    return this;
  }
  remove() {
    this.el.remove();
  }
  getElement() {
    return this.el;
  }
}
vi.mock("maplibre-gl", () => ({
  Map: FakeMap,
  Marker: FakeMarker,
  NavigationControl: class {},
  LngLatBounds: class {
    extend() {
      return this;
    }
  },
  setWorkerUrl: () => {},
}));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));

const { MapCanvas } = await import("./MapCanvas");

function makePins(quiet: number, crowding = 0): MapPin[] {
  return [
    ...Array.from({ length: quiet }, (_, i) => ({ id: `q${i}`, lat: 43, lng: 141, quietness: "quiet" as const, label: `静${i}` })),
    ...Array.from({ length: crowding }, (_, i) => ({ id: `c${i}`, lat: 43, lng: 141, quietness: "crowding" as const, label: `並${i}` })),
  ];
}

const stamps = () => Array.from(document.querySelectorAll<HTMLElement>(".pin-stamp"));
const outers = () => Array.from(document.querySelectorAll<HTMLElement>(".map-pin-hit-area"));

beforeEach(() => {
  maps.length = 0;
  window.sessionStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mockReducedMotion(false);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = "";
});

function mount(pins: MapPin[], introKey = "sapporo") {
  const utils = render(<MapCanvas center={{ lat: 43, lng: 141 }} pins={pins} introKey={introKey} />);
  const map = maps[maps.length - 1];
  act(() => map.fire("load"));
  return { ...utils, map };
}

describe("MapCanvas: 判子の入場（SPEC motion §5.2）", () => {
  it("地図の最初の idle まで、ピンは透明で待ち、押せず Tab でも入れない", () => {
    mount(makePins(3));
    expect(stamps()).toHaveLength(3);
    for (const s of stamps()) expect(s).toHaveClass("is-waiting");
    for (const o of outers()) expect(o.inert).toBe(true);
  });

  it("idle で静かな店から順に押す（30ms ずらし）。インクは最初の3つの「静」だけ", () => {
    const { map } = mount(makePins(4, 2));
    act(() => map.fire("idle"));
    const list = stamps();
    list.forEach((s, i) => {
      expect(s).toHaveClass("is-stamping");
      expect(s.style.getPropertyValue("--d")).toBe(`${i * 30}ms`);
    });
    expect(list.filter((s) => s.classList.contains("has-ink"))).toHaveLength(3);
    for (const o of outers()) expect(o.inert).toBe(false);
  });

  it("地図が動いている間は始めず、止まってから押す", () => {
    const { map } = mount(makePins(2));
    map.moving = true;
    act(() => map.fire("idle"));
    expect(stamps()[0]).toHaveClass("is-waiting");
    map.moving = false;
    act(() => map.fire("moveend"));
    expect(stamps()[0]).toHaveClass("is-stamping");
  });

  it("判子は 24 個まで。25 個目から後は遅れ 720ms のフェード", () => {
    const { map } = mount(makePins(30));
    act(() => map.fire("idle"));
    const list = stamps();
    expect(list.filter((s) => s.classList.contains("is-stamping"))).toHaveLength(24);
    const fading = list.filter((s) => s.classList.contains("is-fading"));
    expect(fading).toHaveLength(6);
    for (const s of fading) expect(s.style.getPropertyValue("--d")).toBe("720ms");
  });

  it("idle が来なくても load から 1200ms で始める", () => {
    vi.useFakeTimers();
    mount(makePins(2));
    expect(stamps()[0]).toHaveClass("is-waiting");
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(stamps()[0]).toHaveClass("is-stamping");
  });

  it("同じタブで同じ街を2回目に開いたら、判子の代わりに全部フェード（遅れなし）", () => {
    const first = mount(makePins(2));
    act(() => first.map.fire("idle"));
    first.unmount();
    document.body.innerHTML = "";
    const second = mount(makePins(2));
    act(() => second.map.fire("idle"));
    for (const s of stamps()) {
      expect(s).toHaveClass("is-fading");
      expect(s.style.getPropertyValue("--d")).toBe("0ms");
    }
  });

  it("重なったときに静かな店が上に来るよう、外側に data-q を持つ", () => {
    mount(makePins(1, 1));
    expect(outers().map((o) => o.dataset.q)).toEqual(["quiet", "crowding"]);
  });

  it("reduce では待たずに最初から押された状態", () => {
    mockReducedMotion(true);
    mount(makePins(2));
    for (const s of stamps()) {
      expect(s).not.toHaveClass("is-waiting");
      expect(s).not.toHaveClass("is-stamping");
    }
    for (const o of outers()) expect(o.inert).not.toBe(true);
  });
});
