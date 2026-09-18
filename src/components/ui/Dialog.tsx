"use client";

import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  /** CONTRACT にはないが、本文/フッターを組めるようにするための追加オプション。 */
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function Dialog({ open, title, onClose, children, actions, className }: DialogProps) {
  // 見出し（title）をダイアログのアクセシブルネームにする（SPEC §9.16 の確認ダイアログで追加）。
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className={cn("dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div id={titleId} className="dialog-title">
          {title}
        </div>
        {children ? <div className="dialog-body">{children}</div> : null}
        {actions ? <div className="dialog-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
