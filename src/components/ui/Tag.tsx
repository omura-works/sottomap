import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * docs/CONTRACT.md `src/lib/db/types.ts` で定義される TagKind と同一の型。
 * T1 は T2 所有の `src/lib/**` を書けないため、ここに構造的に同一の型として
 * 複製している（文字列リテラルユニオンなので T2 実装後も型互換）。
 */
export type TagKind = "accent" | "accent2" | "neutral" | "outline";

const KIND_CLASS: Record<TagKind, string> = {
  accent: "tag-accent",
  accent2: "tag-accent-2",
  neutral: "tag-neutral",
  outline: "tag-outline",
};

export interface TagProps extends HTMLAttributes<HTMLElement> {
  kind?: TagKind;
  as?: "span" | "button";
  selected?: boolean;
  /** as="button" のときのみ意味を持つ追加オプション。 */
  disabled?: boolean;
  children?: ReactNode;
}

export function Tag({ as = "span", kind, selected = false, disabled, className, children, ...rest }: TagProps) {
  const classes = cn("tag", kind && KIND_CLASS[kind], selected && "tag-selected", className);

  if (as === "button") {
    return (
      <button type="button" className={classes} disabled={disabled} aria-pressed={selected} {...rest}>
        {children}
      </button>
    );
  }

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
