// 位置計算の共有ロジック（距離計算と「徒歩10分」のしきい値）。
// 「徒歩10分」の判定はクライアント側（`src/components/map/geo.ts`）だけで行う（Codex R9 重要1）。

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_M = 6371000;

/** 2点間の距離（メートル）。ヒュベニの公式ではなく簡易な球面距離（Haversine）で十分な精度とする。 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** 分速80m（時速4.8km相当）を徒歩の目安速度とする（CONTRACT追補）。 */
export const WALK_METERS_PER_MINUTE = 80;

/**
 * 「徒歩10分」の目安距離（メートル）。'within-10min' フィルタのしきい値はこの値を使う。
 * Codex R9 重要1でサーバー側の距離絞り込みは撤去済みで、現在はクライアント側（components/map/geo.ts）だけで判定する。
 */
export const WITHIN_10MIN_METERS = 10 * WALK_METERS_PER_MINUTE;

/** メートル距離を「徒歩N分」に変換する（切り上げ、最低1分）。 */
export function computeWalkMinutes(meters: number): number {
  return Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));
}
