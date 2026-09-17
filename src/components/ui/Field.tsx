import { useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value"> {
  label: string;
  maxLength?: number;
  value?: string;
  /** 通常の補足文（スタイルガイドの「正直な理由を一言で。」など）。エラー扱いはしない。 */
  description?: ReactNode;
  /** 入力エラー。指定時のみ `aria-invalid` / `role="alert"` を付ける。 */
  error?: ReactNode;
}

/**
 * label + input + （maxLength指定時のみ）文字数カウンタ。
 * 例: 「なぜ、あなたはここへ行くのか（60字まで）」で `maxLength={60}` を渡す。
 *
 * SPEC §9.14-16: `description`（補足）と `error` は別 prop。
 * `aria-invalid` と `role="alert"` は `error` のときだけ付ける。
 */
export function Field({ label, maxLength, value, description, error, id, className, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const length = value?.length ?? 0;
  const describedBy = [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("field", className)}>
      <label htmlFor={inputId}>{label}</label>
      <input
        id={inputId}
        className="input"
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {typeof maxLength === "number" ? (
        <div className="field-counter">
          {length}/{maxLength}
        </div>
      ) : null}
      {description ? (
        <div id={descriptionId} className="field-hint">
          {description}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} className="field-hint" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
