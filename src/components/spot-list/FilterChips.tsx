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
      style={{ display: "flex", flexWrap: "wrap", gap: 6 }}
    >
      {FILTER_OPTIONS.map((option) => {
        const isActive = active.includes(option.slug);
        return (
          <Tag key={option.slug} as="button" kind={isActive ? "accent" : "outline"} aria-pressed={isActive} onClick={() => onToggle(option.slug)}>
            {option.label}
          </Tag>
        );
      })}
    </div>
  );
}
