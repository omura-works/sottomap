import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value"> {
  label: string;
  maxLength?: number;
  value?: string;
  hint?: ReactNode;
}

/**
 * label + input + （maxLength指定時のみ）文字数カウンタ。
 * 例: 「なぜ、あなたはここへ行くのか（60字まで）」で `maxLength={60}` を渡す。
 */
export function Field({ label, maxLength, value, hint, id, className, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const length = value?.length ?? 0;

  return (
    <div className={cn("field", className)}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="input"
        maxLength={maxLength}
        value={value}
        aria-invalid={hint ? true : undefined}
        aria-describedby={hint ? hintId : undefined}
        {...props}
      />
      {typeof maxLength === "number" ? (
        <div className="field-counter">
          {length}/{maxLength}
        </div>
      ) : null}
      {hint ? (
        <div id={hintId} className="field-hint" role="alert">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
