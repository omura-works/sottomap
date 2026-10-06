"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeHomeCityAction } from "@/app/actions/home-city";
import { formatHomeCityChangeDate, homeCityConfirmMessage, nextHomeCityChangeAt } from "@/lib/domain/home-city";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** 処理中は aria-disabled（フォーカスを保つため disabled にしない）。見た目は .btn:disabled と同じ値にそろえる。 */
const DIALOG_BUTTON_CLASS = "min-h-11 aria-disabled:opacity-45 aria-disabled:cursor-not-allowed";

export interface HomeCityOption {
  slug: string;
  name: string;
}

export interface HomeCitySettingProps {
  cities: HomeCityOption[];
  /** 今の住んでいる街（未設定なら null）。 */
  currentCitySlug: string | null;
  /** 90日の制限中なら「次に変えられるのは◯年◯月◯日以降です。」（サーバーで作る）。制限が無ければ null。 */
  nextChangeNote: string | null;
}

/**
 * /me「住んでいる街」（SPEC §9.16）。住んでいる街を変えられる唯一の明示的な操作。
 * 「変更する」→ 街を選ぶ →「変える」→ 確認ダイアログ →「変える」で確定する。
 * 90日に1回までの制限は DB（デモはフィクスチャ）が強制し、拒否されたら role="alert" で理由を出す。
 * 確認ダイアログはモーダル（R13 重要2）: 初期フォーカスは「やめる」。「変える」を押したら処理中も開いたまま、
 * ボタンを無効（aria-disabled。フォーカスを失わないよう disabled にはしない）にして aria-busy と
 * 常設のライブリージョン「変更しています…」で知らせる。失敗はダイアログ内に role="alert" で出して閉じない。
 * 閉じたら起点へフォーカスを戻す（成功: 編集欄が閉じるので「変更する」、取消・失敗後の取消: ダイアログを開いた「変える」）。
 */
export function HomeCitySetting({ cities, currentCitySlug, nextChangeNote }: HomeCitySettingProps) {
  const router = useRouter();
  const selectId = useId();
  const [currentSlug, setCurrentSlug] = useState(currentCitySlug);
  const [note, setNote] = useState(nextChangeNote);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, startTransition] = useTransition();

  const choices = cities.filter((city) => city.slug !== currentSlug);
  const [selectedSlug, setSelectedSlug] = useState(choices[0]?.slug ?? "");

  const editButtonRef = useRef<HTMLButtonElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const dialogCancelRef = useRef<HTMLButtonElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const focusAfterRender = useRef<"edit" | "select" | "submit" | null>(null);

  useEffect(() => {
    const target = focusAfterRender.current;
    focusAfterRender.current = null;
    if (target === "edit") editButtonRef.current?.focus();
    if (target === "select") selectRef.current?.focus();
    if (target === "submit") submitButtonRef.current?.focus();
  });

  const currentName = cities.find((city) => city.slug === currentSlug)?.name ?? null;
  const selectedName = cities.find((city) => city.slug === selectedSlug)?.name ?? "";
  const confirmMessage =
    currentSlug === null
      ? `住んでいる街を${selectedName}に変えますか。`
      : homeCityConfirmMessage(selectedName);

  const startEditing = () => {
    setError(null);
    setStatus("");
    const firstChoice = cities.find((city) => city.slug !== currentSlug);
    setSelectedSlug(firstChoice?.slug ?? "");
    setEditing(true);
    focusAfterRender.current = "select";
  };

  const cancelEditing = () => {
    setEditing(false);
    setError(null);
    focusAfterRender.current = "edit";
  };

  const closeConfirm = () => {
    // 処理中は閉じない（Esc・背景は Dialog の busy が止める。「やめる」はここで止める）。
    if (isPending) return;
    setConfirming(false);
    focusAfterRender.current = "submit";
  };

  const confirmChange = () => {
    if (isPending) return;
    const slug = selectedSlug;
    setError(null);
    setStatus("");
    startTransition(async () => {
      const result = await changeHomeCityAction(slug);
      if (!result.ok) {
        // ダイアログは閉じずに、ダイアログの中で理由を知らせる。
        setError(result.message);
        return;
      }
      const next = nextHomeCityChangeAt(result.changedAt);
      setCurrentSlug(slug);
      setNote(next ? `次に変えられるのは${formatHomeCityChangeDate(next)}以降です。` : null);
      setConfirming(false);
      setEditing(false);
      setStatus(`住んでいる街を${result.cityName}に変えました。`);
      focusAfterRender.current = "edit";
      router.refresh();
    });
  };

  return (
    <section className="space-y-3" aria-labelledby={`${selectId}-heading`}>
      <h3 id={`${selectId}-heading`}>住んでいる街</h3>
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 text-lg" style={{ fontFamily: "var(--font-body)", fontWeight: 700 }}>
          {currentName ?? "まだ決めていません"}
        </p>
        {!editing ? (
          <Button ref={editButtonRef} variant="secondary" className="min-h-11" onClick={startEditing}>
            変更する
          </Button>
        ) : null}
      </div>
      {note ? <p className="text-muted text-sm m-0">{note}</p> : null}
      <p className="text-muted text-sm m-0">
        ピンを立てられるのも、地元として確認できるのも、住んでいる街だけです。住んでいる街は90日に1回まで変えられます。
      </p>

      {editing ? (
        <div className="space-y-2">
          <div className="field">
            <label htmlFor={selectId}>住んでいる街を選ぶ</label>
            <select
              ref={selectRef}
              id={selectId}
              className="input min-h-11"
              value={selectedSlug}
              onChange={(event) => setSelectedSlug(event.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error && !confirming ? `${selectId}-error` : undefined}
            >
              {choices.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              ref={submitButtonRef}
              variant="primary"
              className="min-h-11"
              disabled={!selectedSlug}
              onClick={() => {
                setError(null);
                setConfirming(true);
              }}
            >
              変える
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={cancelEditing}>
              やめる
            </Button>
          </div>
        </div>
      ) : null}

      {/* ダイアログを閉じた後も、拒否の理由は選択欄に結び付けて残す（通知はダイアログ内の role="alert" で済んでいる）。 */}
      {error && !confirming ? (
        <p id={`${selectId}-error`} className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </p>
      ) : null}
      <p role="status" aria-live="polite" className="text-sm m-0">
        {status}
      </p>

      <Dialog
        open={confirming}
        title={confirmMessage}
        onClose={closeConfirm}
        busy={isPending}
        initialFocusRef={dialogCancelRef}
        notice={
          <>
            {/* 常設のライブリージョン（ダイアログを開いた時点から空で置き、処理中だけ文言を入れる）。 */}
            <p role="status" aria-live="polite" className="text-sm m-0">
              {isPending ? "変更しています…" : ""}
            </p>
            {error ? (
              <p role="alert" className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
                {error}
              </p>
            ) : null}
          </>
        }
        actions={
          <>
            <Button
              ref={dialogCancelRef}
              variant="ghost"
              className={DIALOG_BUTTON_CLASS}
              aria-disabled={isPending || undefined}
              onClick={closeConfirm}
            >
              やめる
            </Button>
            <Button
              variant="primary"
              className={DIALOG_BUTTON_CLASS}
              aria-disabled={isPending || undefined}
              aria-busy={isPending || undefined}
              onClick={confirmChange}
            >
              変える
            </Button>
          </>
        }
      />
    </section>
  );
}
