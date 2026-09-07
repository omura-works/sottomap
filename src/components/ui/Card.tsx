import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export type CardElevation = "sm" | "md" | "lg";

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  kicker?: ReactNode;
  /** ネイティブ div の title 属性（ツールチップ）と衝突するため Omit で上書きしている。 */
  title?: ReactNode;
  meta?: ReactNode;
  elevation?: CardElevation;
}

const ELEVATION_CLASS: Record<CardElevation, string> = {
  sm: "elev-sm",
  md: "elev-md",
  lg: "elev-lg",
};

export function Card({ kicker, title, meta, elevation, className, children, ...props }: CardProps) {
  return (
    <div className={cn("card", elevation && ELEVATION_CLASS[elevation], className)} {...props}>
      {kicker ? <div className="card-kicker">{kicker}</div> : null}
      {title ? <div className="card-title">{title}</div> : null}
      {children ? <div className="card-body">{children}</div> : null}
      {meta ? <div className="card-meta">{meta}</div> : null}
    </div>
  );
}
