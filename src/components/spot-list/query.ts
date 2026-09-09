// `/[city]` と `/[city]/search`（どちらも Task 3 所有）で共通して使う
// searchParams パースの小さなヘルパー。

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseOrigin(
  lat: string | string[] | undefined,
  lng: string | string[] | undefined,
): { lat: number; lng: number } | undefined {
  const latVal = firstParam(lat);
  const lngVal = firstParam(lng);
  if (!latVal || !lngVal) return undefined;
  const parsedLat = Number(latVal);
  const parsedLng = Number(lngVal);
  if (Number.isNaN(parsedLat) || Number.isNaN(parsedLng)) return undefined;
  return { lat: parsedLat, lng: parsedLng };
}

/** `?spots=id1,id2,...`（栞画面の「N軒を地図にまとめる」からの受け口）をパースする。 */
export function parseFocusedSpotIds(value: string | string[] | undefined): string[] | null {
  const raw = firstParam(value);
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
}
