import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPinElement,
  hasStamped,
  leavePin,
  markStamped,
  PIN_HALO_CLASS,
  playPinEntrance,
  removePinHalo,
  setMarkerGlyph,
  setPinRibbon,
  spawnPinHalo,
} from "./pin-halo";

function makeMarker(glyph = "静") {
  const { outer } = createPinElement({ id: "spot-1", quietness: "quiet", ariaLabel: "店・まだ静か", title: "店（まだ静か）", tilt: 3 });
  setMarkerGlyph(outer, glyph);
  document.body.appendChild(outer);
  return outer;
}

afterEach(() => {
  document.body.innerHTML = "";
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("ピンの2層（SPEC motion §5.2.1）", () => {
  it("外側は操作と読み上げだけ、見た目と字は内側の .pin-stamp", () => {
    const { outer, stamp } = createPinElement({
      id: "spot-1",
      quietness: "crowding",
      ariaLabel: "シハチ鮮魚店・並びはじめた",
      title: "シハチ鮮魚店（並びはじめた）",
      tilt: -2,
    });
    expect(outer).toHaveClass("map-pin-hit-area");
    expect(outer).toHaveAttribute("role", "button");
    expect(outer).toHaveAttribute("tabindex", "0");
    expect(outer).toHaveAttribute("aria-label", "シハチ鮮魚店・並びはじめた");
    // 外側には見た目・transform・opacity の指定を付けない（MapLibre が位置の transform を書く要素）
    expect(outer.getAttribute("style") ?? "").toBe("");
    expect(outer.firstElementChild).toBe(stamp);
    expect(stamp).toHaveClass("pin-stamp");
    expect(stamp).toHaveAttribute("data-q", "crowding");
    expect(stamp).toHaveAttribute("aria-hidden", "true");
    expect(stamp.style.getPropertyValue("--tilt")).toBe("-2deg");
    expect(stamp.textContent).toBe("並");
  });

  it("字の差し替えは内側の判子だけ（外側の輪・リボンは残る）", () => {
    const el = makeMarker("静");
    spawnPinHalo(el, "var(--color-accent-2-400)", false);
    setPinRibbon(el, true);
    setMarkerGlyph(el, "観");
    expect(el.querySelector(".pin-stamp")?.textContent).toBe("観");
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).not.toBeNull();
    expect(el.querySelector(".pin-ribbon")).not.toBeNull();
  });

  it("栞のリボンは data-bookmarked と一緒に付け外しする", () => {
    const el = makeMarker();
    setPinRibbon(el, true, "tuck", 0);
    expect(el).toHaveAttribute("data-bookmarked", "true");
    expect(el.querySelector(".pin-ribbon")).toHaveClass("verb-tuck");
    setPinRibbon(el, false);
    expect(el).toHaveAttribute("data-bookmarked", "false");
    expect(el.querySelector(".pin-ribbon")).toBeNull();
  });

  it("判子の入場は内側にだけクラスを付け、終わったら外す（選択の scale を上書きしないように）", () => {
    const el = makeMarker();
    const stamp = el.querySelector<HTMLElement>(".pin-stamp")!;
    stamp.classList.add("is-waiting");
    playPinEntrance(stamp, "stamp", 60, true);
    expect(stamp).toHaveClass("is-stamping", "has-ink");
    expect(stamp).not.toHaveClass("is-waiting");
    expect(stamp.style.getPropertyValue("--d")).toBe("60ms");
    expect(el.getAttribute("style") ?? "").toBe("");
    const end = new Event("animationend") as AnimationEvent;
    Object.defineProperty(end, "animationName", { value: "v-stamp" });
    Object.defineProperty(end, "pseudoElement", { value: "" });
    stamp.dispatchEvent(end);
    expect(stamp).not.toHaveClass("is-stamping");
  });

  it("消えるピン: 外側はすぐにフォーカス・読み上げ・当たり判定から外れ、180ms 後に取り除く", () => {
    vi.useFakeTimers();
    const el = makeMarker();
    const done = vi.fn();
    leavePin(el, false, done);
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el).toHaveAttribute("tabindex", "-1");
    expect(el.style.pointerEvents).toBe("none");
    expect(el.querySelector(".pin-stamp")).toHaveClass("is-leaving");
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(180);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it("消えるピン（reduce）: すぐに取り除く。戻ってきたら元に戻せる", () => {
    const el = makeMarker();
    const done = vi.fn();
    leavePin(el, true, done);
    expect(done).toHaveBeenCalledTimes(1);

    vi.useFakeTimers();
    const el2 = makeMarker();
    const done2 = vi.fn();
    const cancel = leavePin(el2, false, done2);
    cancel();
    vi.advanceTimersByTime(300);
    expect(done2).not.toHaveBeenCalled();
    expect(el2).not.toHaveAttribute("aria-hidden");
    expect(el2).toHaveAttribute("tabindex", "0");
  });

  it("2回目の判子は sessionStorage で覚える（キーが無ければ覚えない）", () => {
    expect(hasStamped("sapporo")).toBe(false);
    markStamped("sapporo");
    expect(hasStamped("sapporo")).toBe(true);
    expect(window.sessionStorage.getItem("sotto:stamped:sapporo")).toBe("1");
    markStamped(undefined);
    expect(hasStamped(undefined)).toBe(false);
  });
});

describe("フォーカスハロー（選択したピンの輪）", () => {
  it("判子の地の色の輪を1本だけ外側に足す（aria-hidden。選択し直したら差し替える）", () => {
    const el = makeMarker();
    spawnPinHalo(el, "var(--color-accent-2-400)", false);
    const halo = spawnPinHalo(el, "var(--color-accent-2-400)", false);
    expect(el.querySelectorAll(`.${PIN_HALO_CLASS}`)).toHaveLength(1);
    expect(halo?.parentElement).toBe(el);
    expect(halo).toHaveAttribute("aria-hidden", "true");
    expect(halo?.style.color).toBe("var(--color-accent-2-400)");
    // ピンの文字（見た目）はそのまま。
    expect(el.querySelector(".pin-stamp")?.textContent).toBe("静");
  });

  it("reduced-motion のときは輪を足さない（既存の輪も外す）", () => {
    const el = makeMarker();
    spawnPinHalo(el, "var(--color-accent-400)", false);
    expect(spawnPinHalo(el, "var(--color-accent-400)", true)).toBeNull();
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).toBeNull();
  });

  it("アニメーションが終わったら（終わらなくても一定時間で）輪を片付ける", () => {
    vi.useFakeTimers();
    const el = makeMarker();
    const halo = spawnPinHalo(el, "var(--color-accent-400)", false);
    halo?.dispatchEvent(new Event("animationend"));
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).toBeNull();

    spawnPinHalo(el, "var(--color-accent-400)", false);
    vi.advanceTimersByTime(1300);
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).toBeNull();
    removePinHalo(el);
  });
});
