import { createHash, timingSafeEqual } from "node:crypto";

/**
 * `Authorization: Bearer <CRON_SECRET>` の検査（Spec §9.13.7）。
 * 両方を SHA-256 で固定長にしてから timingSafeEqual で比べる（長さの違いも時間差として漏らさない）。
 * CRON_SECRET が未設定・空なら常に拒否する。
 */
export function isAuthorizedCronRequest(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret) return false;
  const expected = createHash("sha256").update(`Bearer ${secret}`, "utf8").digest();
  const actual = createHash("sha256").update(authorizationHeader ?? "", "utf8").digest();
  return timingSafeEqual(expected, actual);
}
