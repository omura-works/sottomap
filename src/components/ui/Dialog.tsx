"use client";

import { useId, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent, PointerEvent, ReactNode, RefObject, SyntheticEvent } from "react";
import { cn } from "./cn";

export interface DialogProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  /** CONTRACT にはないが、本文/フッターを組めるようにするための追加オプション。 */
  children?: ReactNode;
  actions?: ReactNode;
  /**
   * 処理中・失敗の通知（ライブリージョン・role="alert"）を置く場所。本文（dialog-body）の薄い文字を受けないよう、
   * 本文とボタンの間に別に置く（文字のコントラストを保つ）。
   */
  notice?: ReactNode;
  className?: string;
  /**
   * 開いたときに最初にフォーカスする要素（確認ダイアログでは破壊的でない「やめる」）。
   * 省略時はダイアログ内の最初のフォーカスできる要素。
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * 処理中。Esc・背景のクリックでは閉じない（onClose を呼ばない）。ダイアログ自体には
   * `aria-busy` は付けない（中の `role="status"` が読まれなくなるため）。処理中の表示は
   * 呼び出し側がボタンに `aria-busy`/`aria-disabled` を付けて示す。
   */
  busy?: boolean;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true",
  );
}

/**
 * モーダルダイアログ（R13 重要2、WCAG 2.4.3 / 2.4.11）。
 * `<dialog>` の `showModal()` で開くため、背景はブラウザが操作不可（inert）にし、ダイアログは最前面に出る。
 * - 見出し（title）を `aria-labelledby` でダイアログの名前にする。
 * - 開いたら initialFocusRef（無ければ最初のフォーカスできる要素）へフォーカスする。
 * - Tab／Shift+Tab はダイアログ内で循環する（ブラウザの外枠へも出さない）。
 * - Esc と背景（::backdrop。pointerdown・click の両方が背景で起きたときだけ）のクリックで onClose。
 *   処理中（busy）は閉じない。
 * - 閉じたら、開く前にフォーカスがあった要素へ戻す（呼び出し側が描画後に別の要素へ移してもよい）。
 * - ブラウザが自力で `<dialog>` を閉じた場合（Android の戻る連打などで preventDefault が効かなかった
 *   場合）も native の `close` イベントを拾って onClose を呼び、親の状態とそろえる。
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  return <ModalDialog {...props} />;
}

function ModalDialog({
  title,
  onClose,
  children,
  actions,
  notice,
  className,
  initialFocusRef,
  busy = false,
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  // requestClose・アンマウント時のクリーンアップなど、自分自身の操作で <dialog> を閉じたときは
  // 続く native "close" イベントで onClose を再度呼ばないようにする（ブラウザが自力で閉じた場合だけ呼ぶ）。
  const closingBySelfRef = useRef(false);
  // 背景クリックは pointerdown と click の両方が dialog 要素そのもので起きたときだけ閉じる
  // （中で押して外で離す/外で押して中で離すドラッグでは閉じない）。
  const backdropPointerDownRef = useRef(false);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    const target = initialFocusRef?.current ?? focusableElements(dialog)[0] ?? dialog;
    target.focus();
    return () => {
      closingBySelfRef.current = true;
      if (dialog.open) dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [initialFocusRef]);

  const requestClose = () => {
    if (busy) return;
    closingBySelfRef.current = true;
    onClose();
  };

  // ブラウザが自力で <dialog> を閉じた場合（Android の戻る連打など、こちらの preventDefault が
  // 効かなかった場合）に発火する。自分自身の close() 呼び出しに続くものであれば何もしない。
  const handleNativeClose = () => {
    if (closingBySelfRef.current) {
      closingBySelfRef.current = false;
      return;
    }
    onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === "Escape") {
      // ブラウザ既定の cancel（閉じる）を止め、開閉は open プロパティで管理する。
      event.preventDefault();
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = event.currentTarget;
    const elements = focusableElements(dialog);
    if (elements.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const first = elements[0];
    const last = elements[elements.length - 1];
    const active = document.activeElement;
    const outside = !(active instanceof Node) || active === dialog || !dialog.contains(active);
    if (event.shiftKey && (active === first || outside)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || outside)) {
      event.preventDefault();
      first.focus();
    }
  };

  // Esc 以外の閉じる要求（Android の戻る操作など）も、開閉は open プロパティで管理する。
  const handleCancel = (event: SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    requestClose();
  };

  // 背景（::backdrop）のクリックは dialog 要素そのものに届く（中身は内側の .dialog が受ける）。
  // pointerdown と click の両方が dialog 要素自身で起きたときだけ閉じる（中で押して外で離す、
  // 外で押して中で離す、といった操作では閉じない）。
  const handlePointerDown = (event: PointerEvent<HTMLDialogElement>) => {
    backdropPointerDownRef.current = event.target === event.currentTarget;
  };

  const handleClick = (event: MouseEvent<HTMLDialogElement>) => {
    const startedOnBackdrop = backdropPointerDownRef.current;
    backdropPointerDownRef.current = false;
    if (event.target === event.currentTarget && startedOnBackdrop) requestClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onCancel={handleCancel}
      onClose={handleNativeClose}
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      className="m-auto w-[min(440px,calc(100%-2*var(--space-4)))] max-w-none border-0 bg-transparent p-0 text-inherit backdrop:bg-[color-mix(in_srgb,var(--color-neutral-900)_50%,transparent)]"
    >
      <div className={cn("dialog", className)}>
        <div id={titleId} className="dialog-title">
          {title}
        </div>
        {children ? <div className="dialog-body">{children}</div> : null}
        {notice}
        {actions ? <div className="dialog-actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}
