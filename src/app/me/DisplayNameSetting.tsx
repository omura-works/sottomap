"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { changeDisplayNameAction } from "@/app/actions/display-name";
import { Button } from "@/components/ui/Button";

/** 処理中は aria-disabled（フォーカスを保つため disabled にしない）。見た目は .btn:disabled と同じ値にそろえる。 */
const BUTTON_CLASS = "min-h-11 aria-disabled:opacity-45 aria-disabled:cursor-not-allowed";

export interface DisplayNameSettingProps {
  /** 今の表示名。 */
  currentName: string;
}

/**
 * /me「表示名」（SPEC §9.18-1）。表示名を変えられる唯一の操作。確認ダイアログは出さない。
 * 「表示名を変更する」→ 入力 →「保存する」。成功は role="status"、拒否は role="alert" で理由を出し、
 * 入力欄に結び付けて残す（aria-invalid・aria-describedby）。規則は DB 関数 set_display_name が強制する。
 */
export function DisplayNameSetting({ currentName }: DisplayNameSettingProps) {
  const router = useRouter();
  const inputId = useId();
  const [name, setName] = useState(currentName);
  const [draft, setDraft] = useState(currentName);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  const editButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const focusAfterRender = useRef<"edit" | "input" | null>(null);

  useEffect(() => {
    const target = focusAfterRender.current;
    focusAfterRender.current = null;
    if (target === "edit") editButtonRef.current?.focus();
    if (target === "input") inputRef.current?.focus();
  });

  const startEditing = () => {
    setDraft(name);
    setError(null);
    setStatus("");
    setEditing(true);
    focusAfterRender.current = "input";
  };

  const cancelEditing = () => {
    if (isPending) return;
    setEditing(false);
    setError(null);
    focusAfterRender.current = "edit";
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    const value = draft;
    setError(null);
    setStatus("");
    startTransition(async () => {
      const result = await changeDisplayNameAction(value);
      if (!result.ok) {
        setError(result.message);
        focusAfterRender.current = "input";
        return;
      }
      setName(result.displayName);
      setEditing(false);
      setStatus(`表示名を「${result.displayName}」に変えました。`);
      focusAfterRender.current = "edit";
      router.refresh();
    });
  };

  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  return (
    <section className="space-y-3" aria-labelledby={`${inputId}-heading`}>
      <h3 id={`${inputId}-heading`}>表示名</h3>
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 text-lg" style={{ fontFamily: "var(--font-body)", fontWeight: 700 }}>
          {name}
        </p>
        {!editing ? (
          <Button ref={editButtonRef} variant="secondary" className="min-h-11" onClick={startEditing}>
            表示名を変更する
          </Button>
        ) : null}
      </div>
      <p id={hintId} className="text-muted text-sm m-0">
        あなたが書いた店の詳細に、署名として表示されます。20文字まで。メールアドレスは使えません。
      </p>

      {editing ? (
        <form className="space-y-2" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor={inputId}>新しい表示名</label>
            <input
              ref={inputRef}
              id={inputId}
              type="text"
              className="input min-h-11"
              value={draft}
              autoComplete="nickname"
              onChange={(event) => setDraft(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            />
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="primary"
              className={BUTTON_CLASS}
              aria-disabled={isPending || undefined}
              aria-busy={isPending || undefined}
            >
              保存する
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={BUTTON_CLASS}
              aria-disabled={isPending || undefined}
              onClick={cancelEditing}
            >
              やめる
            </Button>
          </div>
        </form>
      ) : null}

      <p role="status" aria-live="polite" className="text-sm m-0">
        {isPending ? "保存しています…" : status}
      </p>
    </section>
  );
}
