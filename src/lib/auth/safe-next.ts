const FALLBACK_PATH = "/start";

/** URLとして解決した後も同一originに留まる遷移先だけを許可する。 */
export function safeNextPath(value: unknown, baseOrigin: string): string {
  if (typeof value !== "string" || value.length === 0) return FALLBACK_PATH;

  try {
    const base = new URL(baseOrigin);
    const resolved = new URL(value, base);
    if (resolved.origin !== base.origin) return FALLBACK_PATH;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return FALLBACK_PATH;
  }
}
