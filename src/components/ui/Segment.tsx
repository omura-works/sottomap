"use client";

import { useId } from "react";
import { HandLine } from "@/components/illustrations/HandLine";
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
  /**
   * SPEC motion §2.9: "fill"（既定）は選んだ選択肢を accent-600 で塗る。"circle" は塗りの代わりに、
   * 選んだ字を手描きの丸（accent-600・2.5px）で囲み、字を 700・accent-800 にする（ピンを立てる画面の「頻度」だけ）。
   */
  variant?: "fill" | "circle";
}

/** 昼/夜/朝 のような排他選択（原本 `.seg` / `.seg-opt` の移植）。 */
export function Segment({ options, value, onChange, className, variant = "fill", ...rest }: SegmentProps) {
  const name = useId();

  return (
    <div className={cn("seg", className)} data-variant={variant} role="radiogroup" {...rest}>
      {options.map((option) => {
        const checked = value === option.value;
        return (
          <label key={option.value} className="seg-opt" data-on={checked ? "true" : "false"}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
            />
            {variant === "circle" ? (
              <span className="seg-label">
                {option.label}
                <HandLine variant="circle" className="seg-circle" />
              </span>
            ) : (
              <span>{option.label}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
