import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";
import { HandLine } from "@/components/illustrations/HandLine";
import { cn } from "./cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /**
   * SPEC motion §2.9: フォーカスで欄の下に手描きの下線（accent-500・太さ 3）が 280ms で描かれ、
   * 外れると 160ms で消える（フォーカスの輪の代わりではなく足し算）。**検索欄とログインのメール欄だけ**で使う。
   */
  underline?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, underline = false, ...props }, ref) {
  const input = <input ref={ref} className={cn("input", className)} {...props} />;
  if (!underline) return input;
  return (
    <span className="input-ink">
      {input}
      <HandLine variant="underline" strokeWidth={3} className="input-ink-line" />
    </span>
  );
});
