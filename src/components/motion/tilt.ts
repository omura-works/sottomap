/**
 * 止まった傾きを id から決める（SPEC motion §2.8）。乱数を使わないので、描き直しても同じ角度になる。
 */

/** FNV-1a の 32bit ハッシュ（符号なし）。 */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 整数の度。max=4 なら -4..4。 */
export function tiltFromId(id: string, max: number): number {
  const span = max * 2 + 1;
  return (hash32(id) % span) - max;
}
