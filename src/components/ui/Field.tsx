"use client";

import { useId, useState } from "react";
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

/** 残りがこの字数以下になったら「あと N 字」を添え、数字を強める（SPEC motion §5.8.1）。 */
export const FIELD_NEAR_REMAINING = 10;

/**
 * label + input + （maxLength指定時のみ）文字数カウンタ。
 * 例: 「なぜ、あなたはここへ行くのか（60字まで）」で `maxLength={60}` を渡す。
 *
 * SPEC §9.14-16: `description`（補足）と `error` は別 prop。
 * `aria-invalid` と `role="alert"` は `error` のときだけ付ける。
 *
 * SPEC motion §5.8.1: 文字数は Mochiy の数字＋「/上限」。残り 10 字から「あと N 字」を添え（`data-near`）、
 * 0 字で `data-full`。境目をまたいだときだけ数字が跳ねる（1字ごとには動かさない）。読み上げは今のまま。
 */
export function Field({ label, maxLength, value, description, error, id, className, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descriptionId = `${inputId}-description`;
  const errorId = `${inputId}-error`;
  const length = value?.length ?? 0;
  const describedBy = [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  const remaining = typeof maxLength === "number" ? Math.max(0, maxLength - length) : null;
  const near = remaining !== null && remaining <= FIELD_NEAR_REMAINING;
  const full = remaining === 0;
  // 境目（残り10字・0字）をまたいだときだけ数字を跳ねさせる。最初の描画と1字ごとの変化では跳ねない。
  // 前回の描画の値と比べて調整する（React 公式の「前の描画の情報を持つ」パターン）。
  const [previous, setPrevious] = useState({ near, full });
  const [bump, setBump] = useState<"a" | "b" | null>(null);
  if (previous.near !== near || previous.full !== full) {
    setPrevious({ near, full });
    if (near) setBump((current) => (current === "a" ? "b" : "a"));
  }

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
      {typeof maxLength === "number" && remaining !== null ? (
        <div
          className="field-counter"
          data-near={near ? "true" : "false"}
          data-full={full ? "true" : "false"}
          data-bump={bump ?? undefined}
        >
          <span className="field-count">{length}</span>/{maxLength}
          {near ? <span className="field-rest"> あと{remaining}字</span> : null}
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
