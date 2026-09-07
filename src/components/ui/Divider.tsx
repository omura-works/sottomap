import type { HTMLAttributes } from "react";
import { cn } from "./cn";

export type DividerProps = HTMLAttributes<HTMLHRElement>;

export function Divider({ className, ...props }: DividerProps) {
  return <hr className={cn("hr", className)} {...props} />;
}
