"use client";

import { Tag } from "@/components/ui";
import { FILTER_OPTIONS } from "./filters";

export interface FilterChipsProps {
  active: readonly string[];
  onToggle: (slug: string) => void;
  className?: string;
}

/**
 * 絞り込みチップ5種（SPEC §4 S3 / D1）。
 * 「まだ静か」は既定ON。選択中は accent 塗り、非選択は outline（S1のチップと同じ表現）。
 */
export function FilterChips({ active, onToggle, className }: FilterChipsProps) {
  return (
    <div
      className={className ? `chip-group ${className}` : "chip-group"}
      role="group"
      aria-label="絞り込み"
      style={{ display: "flex", flexWrap: "wrap", columnGap: 6, rowGap: 0 }}
    >
      {FILTER_OPTIONS.map((option) => {
        const isActive = active.includes(option.slug);
        // SPEC §9.14-14: 当たり判定は 44×44px 以上の透明なボタン全体。見た目のタグはその中に置く
        // （隣のチップとは列の gap、上下の行とはボタンの高さで区切られ、判定が重ならない）。
        return (
          <button
            key={option.slug}
            type="button"
            className="chip-hit"
            aria-pressed={isActive}
            onClick={() => onToggle(option.slug)}
          >
            <Tag kind={isActive ? "accent" : "outline"}>{option.label}</Tag>
          </button>
        );
      })}
    </div>
  );
}
