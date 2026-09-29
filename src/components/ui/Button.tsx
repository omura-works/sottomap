import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "night";
export type ButtonSize = "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  /**
   * CONTRACT にはないが、原本 CSS の `.btn-icon`（正方形アイコンボタン）を
   * 使えるようにするための追加オプション。既存プロパティの変更は無い。
   */
  icon?: boolean;
  /**
   * SPEC motion §2.9 で足した大きさ。"lg" は各画面の主な行動の大きい主ボタン（高さ 56px・左右 32px）。
   * 既定は "md"（高さ 44px）。
   */
  size?: ButtonSize;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  // 夜の面の上の主ボタン（灯りの地に墨の字。SPEC motion §2.9）
  night: "btn-night",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, block = false, icon = false, size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("btn", variant && VARIANT_CLASS[variant], size === "lg" && "btn-lg", block && "btn-block", icon && "btn-icon", className)}
      {...props}
    />
  );
});
