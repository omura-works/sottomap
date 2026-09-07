"use client";

import { useId } from "react";
import { cn } from "./cn";

export interface SegmentOption {
  value: string;
  label: string;
}

export interface SegmentProps {
  options: Array<SegmentOption>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}

/** 昼/夜/朝 のような排他選択（原本 `.seg` / `.seg-opt` の移植）。 */
export function Segment({ options, value, onChange, className, ...rest }: SegmentProps) {
  const name = useId();

  return (
    <div className={cn("seg", className)} role="radiogroup" {...rest}>
      {options.map((option) => (
        <label key={option.value} className="seg-opt">
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
