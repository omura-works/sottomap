const TOKYO_TIME_ZONE = "Asia/Tokyo";
const TOKYO_UTC_OFFSET_HOURS = 9;
const DAY_MS = 24 * 60 * 60 * 1000;

const TOKYO_PARTS_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: TOKYO_TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

interface TokyoDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function toDate(value: string | Date): Date {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid date");
  return date;
}

function tokyoDateParts(value: string | Date): TokyoDateParts {
  const parts = TOKYO_PARTS_FORMATTER.formatToParts(toDate(value));
  const numberPart = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new RangeError(`Missing date part: ${type}`);
    return Number(part.value);
  };
  return {
    year: numberPart("year"),
    month: numberPart("month"),
    day: numberPart("day"),
    hour: numberPart("hour"),
    minute: numberPart("minute"),
  };
}

function calendarDayNumber(parts: Pick<TokyoDateParts, "year" | "month" | "day">): number {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

/** 日本時間の暦日を基準にした日数差。 */
export function calendarDaysBetweenInTokyo(from: string | Date, to: string | Date): number {
  return calendarDayNumber(tokyoDateParts(to)) - calendarDayNumber(tokyoDateParts(from));
}

/** 「2025年12月」形式。 */
export function formatTokyoYearMonth(value: string | Date): string {
  const { year, month } = tokyoDateParts(value);
  return `${year}年${month}月`;
}

/** 栞の予定日時を「明日 12:30」「9月15日 12:30」形式にする。 */
export function formatPlannedAtInTokyo(
  value: string | null,
  now: Date = new Date(),
): string | null {
  if (!value) return null;

  try {
    const target = tokyoDateParts(value);
    const diffDays = calendarDaysBetweenInTokyo(value, now) * -1;
    const time = `${target.hour}:${String(target.minute).padStart(2, "0")}`;
    if (diffDays === 0) return `今日 ${time}`;
    if (diffDays === 1) return `明日 ${time}`;
    if (diffDays === -1) return `昨日 ${time}`;
    return `${target.month}月${target.day}日 ${time}`;
  } catch {
    return null;
  }
}

/** 指定時点から見た、日本時間で翌日の指定時刻を返す。 */
export function nextDayAtTokyoTime(now: Date, hour: number, minute: number): Date {
  const { year, month, day } = tokyoDateParts(now);
  return new Date(Date.UTC(year, month - 1, day + 1, hour - TOKYO_UTC_OFFSET_HOURS, minute));
}
