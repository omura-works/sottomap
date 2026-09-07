import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  /**
   * CONTRACT にはないが、原本 CSS の `.btn-icon`（正方形アイコンボタン）を
   * 使えるようにするための追加オプション。既存プロパティの変更は無い。
   */
  icon?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, block = false, icon = false, className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("btn", variant && VARIANT_CLASS[variant], block && "btn-block", icon && "btn-icon", className)}
      {...props}
    />
  );
});
