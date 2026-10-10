/**
 * 重なったピンを、表示のためだけに少し放射状にずらす（2026-10-10。実在の店を足して駅前などでピンが重なったため）。
 * 本当の位置（MapLibre が外側の要素に書く位置）は変えず、内側の判子・当たり判定・リボン・輪だけを `translate` で動かす。
 * ずらした量は、本当の位置に残す小さな点とつなぐ細い線（`.pin-tether`）で示す。
 */

/**
 * 画面上で中心どうしがこれより近いピンは重なっているとみなし、ずらした後もこの間をあける（px）。
 * 判子の直径 30px＋輪郭 2px で、これより近いと判子どうしが重なって見える。
 */
export const PIN_SPREAD_MIN_PX = 34;

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface SpreadOffset {
  dx: number;
  dy: number;
}

/**
 * 重なったピンの組ごとに、組の重心のまわりの円に並べたときの、元の位置からのずれ（px）を返す。
 * 円の半径は、隣どうしの間がちょうど `minPx` になる大きさ（2つなら重心から minPx/2 ずつ）。
 * 並べる順は重心から見た元の向き（同じ向き・同じ位置なら渡した順）なので、ずれは最小で、何度計算しても同じ。
 * 重なっていないピンは返さない。
 */
export function computePinSpread(points: readonly ScreenPoint[], minPx: number = PIN_SPREAD_MIN_PX): Map<string, SpreadOffset> {
  const n = points.length;
  const parent = points.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < minPx) {
        parent[find(i)] = find(j);
      }
    }
  }
  // 組ごとに円へ並べる。並べた後に別の組のピンと近すぎれば、その2つの組をまとめて並べ直す（変わらなくなるまで）
  let result = placeGroups(points, find, minPx);
  for (let round = 0; round < n; round++) {
    let merged = false;
    const placed = points.map((p) => {
      const o = result.get(p.id);
      return { x: p.x + (o?.dx ?? 0), y: p.y + (o?.dy ?? 0) };
    });
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (find(i) === find(j)) continue;
        if (Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y) < minPx - 0.5) {
          parent[find(i)] = find(j);
          merged = true;
        }
      }
    }
    if (!merged) break;
    result = placeGroups(points, find, minPx);
  }
  return result;
}

function placeGroups(points: readonly ScreenPoint[], find: (i: number) => number, minPx: number): Map<string, SpreadOffset> {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < points.length; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  }

  const result = new Map<string, SpreadOffset>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const cx = members.reduce((sum, i) => sum + points[i].x, 0) / members.length;
    const cy = members.reduce((sum, i) => sum + points[i].y, 0) / members.length;
    const k = members.length;
    const radius = minPx / (2 * Math.sin(Math.PI / k));
    // 元の向きの順に円周へ。最初のピンの元の向きを起点にして、まわす量を小さくする
    const ordered = members
      .map((i, order) => {
        const dx = points[i].x - cx;
        const dy = points[i].y - cy;
        const angle = Math.hypot(dx, dy) < 0.5 ? (order / k) * 2 * Math.PI - Math.PI / 2 : Math.atan2(dy, dx);
        return { i, angle, order };
      })
      .sort((a, b) => a.angle - b.angle || a.order - b.order);
    const start = ordered[0].angle;
    ordered.forEach(({ i }, slot) => {
      const angle = start + (slot / k) * 2 * Math.PI;
      const tx = cx + radius * Math.cos(angle);
      const ty = cy + radius * Math.sin(angle);
      result.set(points[i].id, { dx: tx - points[i].x, dy: ty - points[i].y });
    });
  }
  return result;
}
