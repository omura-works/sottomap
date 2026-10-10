import { describe, expect, it } from "vitest";
import { computePinSpread, PIN_SPREAD_MIN_PX } from "./pin-spread";
import { createPinElement, setPinSpread } from "./pin-halo";

function placed(points: Array<{ id: string; x: number; y: number }>, spread: ReturnType<typeof computePinSpread>) {
  return points.map((p) => {
    const o = spread.get(p.id) ?? { dx: 0, dy: 0 };
    return { id: p.id, x: p.x + o.dx, y: p.y + o.dy };
  });
}

describe("computePinSpread（重なったピンを表示のためだけにずらす）", () => {
  it("離れているピンはずらさない", () => {
    const spread = computePinSpread([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 40, y: 0 },
    ]);
    expect(spread.size).toBe(0);
    expect(PIN_SPREAD_MIN_PX).toBe(34);
  });

  it("2つが近いと、元の向きのまま重心から半分ずつ離し、間がちょうど最小の距離になる", () => {
    const points = [
      { id: "a", x: 100, y: 100 },
      { id: "b", x: 110, y: 100 },
    ];
    const spread = computePinSpread(points);
    // 重心 105 から左右へ 17px（間 34px）
    expect(spread.get("a")!.dx).toBeCloseTo(-12);
    expect(spread.get("b")!.dx).toBeCloseTo(12);
    const [a, b] = placed(points, spread);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(PIN_SPREAD_MIN_PX);
  });

  it("同じ位置に重なった3つ以上も、円に並べて隣どうしが最小の距離以上離れる。何度計算しても同じ", () => {
    const points = [
      { id: "a", x: 50, y: 50 },
      { id: "b", x: 50, y: 50 },
      { id: "c", x: 51, y: 50 },
      { id: "d", x: 50, y: 52 },
    ];
    const first = computePinSpread(points);
    const after = placed(points, first);
    for (let i = 0; i < after.length; i++)
      for (let j = i + 1; j < after.length; j++)
        expect(Math.hypot(after[i].x - after[j].x, after[i].y - after[j].y)).toBeGreaterThanOrEqual(PIN_SPREAD_MIN_PX - 0.01);
    expect(computePinSpread(points)).toEqual(first);
  });

  it("並べた後に別の組と近すぎれば、まとめて並べ直し、どの2つも最小の距離以上あく", () => {
    const points = [
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 4, y: 0 },
      { id: "c", x: 40, y: 0 },
      { id: "d", x: 70, y: 0 },
    ];
    const after = placed(points, computePinSpread(points));
    for (let i = 0; i < after.length; i++)
      for (let j = i + 1; j < after.length; j++)
        expect(Math.hypot(after[i].x - after[j].x, after[i].y - after[j].y)).toBeGreaterThanOrEqual(PIN_SPREAD_MIN_PX - 0.5);
  });

  it("重なりの組が別々なら、それぞれの組の中だけでずらす", () => {
    const spread = computePinSpread([
      { id: "a", x: 0, y: 0 },
      { id: "b", x: 5, y: 0 },
      { id: "c", x: 300, y: 0 },
      { id: "d", x: 305, y: 0 },
      { id: "e", x: 150, y: 150 },
    ]);
    expect([...spread.keys()].sort()).toEqual(["a", "b", "c", "d"]);
  });
});

describe("setPinSpread", () => {
  it("内側だけを動かす変数を書き、本当の位置の点と線を出す。重ならなくなったら戻す", () => {
    const { outer } = createPinElement({ id: "x", quietness: "quiet", ariaLabel: "店", title: "店", tilt: 0 });
    setPinSpread(outer, { dx: 12, dy: -5 });
    expect(outer.style.getPropertyValue("--sx")).toBe("12px");
    expect(outer.style.getPropertyValue("--sy")).toBe("-5px");
    expect(outer.dataset.spread).toBe("true");
    const tether = outer.querySelector<HTMLElement>(".pin-tether")!;
    expect(tether.style.width).toBe("13px");
    expect(tether.getAttribute("aria-hidden")).toBe("true");
    // 外側の transform（MapLibre が位置を書く）には触れない
    expect(outer.style.transform).toBe("");

    setPinSpread(outer, null);
    expect(outer.style.getPropertyValue("--sx")).toBe("0px");
    expect(outer.dataset.spread).toBeUndefined();
  });
});
