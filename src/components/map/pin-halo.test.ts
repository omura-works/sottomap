import { afterEach, describe, expect, it, vi } from "vitest";
import { PIN_HALO_CLASS, removePinHalo, setMarkerGlyph, spawnPinHalo } from "./pin-halo";

function makeMarker(glyph = "静") {
  const el = document.createElement("div");
  el.textContent = glyph;
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("フォーカスハロー（選択したピンの輪）", () => {
  it("ピンの色の輪を1本だけ足す（aria-hidden。選択し直したら差し替える）", () => {
    const el = makeMarker();
    spawnPinHalo(el, "var(--color-accent-2-600)", false);
    const halo = spawnPinHalo(el, "var(--color-accent-2-600)", false);
    expect(el.querySelectorAll(`.${PIN_HALO_CLASS}`)).toHaveLength(1);
    expect(halo).toHaveAttribute("aria-hidden", "true");
    expect(halo?.style.color).toBe("var(--color-accent-2-600)");
    // ピンの文字（読み上げ・見た目）はそのまま。
    expect(el.textContent).toBe("静");
  });

  it("reduced-motion のときは輪を足さない（既存の輪も外す）", () => {
    const el = makeMarker();
    spawnPinHalo(el, "var(--color-accent-600)", false);
    expect(spawnPinHalo(el, "var(--color-accent-600)", true)).toBeNull();
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).toBeNull();
  });

  it("アニメーションが終わったら（終わらなくても一定時間で）輪を片付ける", () => {
    vi.useFakeTimers();
    const el = makeMarker();
    const halo = spawnPinHalo(el, "var(--color-accent-600)", false);
    halo?.dispatchEvent(new Event("animationend"));
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).toBeNull();

    spawnPinHalo(el, "var(--color-accent-600)", false);
    vi.advanceTimersByTime(1300);
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).toBeNull();
    removePinHalo(el);
  });

  it("グリフの差し替えで輪を消さない", () => {
    const el = makeMarker("静");
    spawnPinHalo(el, "var(--color-accent-600)", false);
    setMarkerGlyph(el, "並");
    expect(el.textContent).toBe("並");
    expect(el.querySelector(`.${PIN_HALO_CLASS}`)).not.toBeNull();
  });
});
