import type { CSSProperties } from "react";

export interface StatProps {
  index: number;
  tone: "orange" | "moss" | "night";
  tilt: number;
  value: number;
  unit: string;
  label: string;
}

/** 数字の付箋（貼られて、数字が跳ねる。keep-visible なので最初から読める）。 */
export function Stat({ index, tone, tilt, value, unit, label }: StatProps) {
  const digits = String(value).length;
  return (
    <div
      className="sticky me-stat verb-stick keep-visible"
      data-tone={tone}
      style={{ "--tilt": `${tilt}deg`, "--d": `${index * 120}ms` } as CSSProperties}
    >
      <p className="me-stat-value">
        <span className="me-stat-num verb-pop" data-digits={digits >= 3 ? "3" : undefined} style={{ "--d": `${index * 120 + 240}ms` } as CSSProperties}>
          {value}
        </span>
        <span className="me-stat-unit">{unit}</span>
      </p>
      <p className="me-stat-label">{label}</p>
    </div>
  );
}
