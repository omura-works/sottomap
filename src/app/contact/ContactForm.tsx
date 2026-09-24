"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useId, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  CONTACT_CATEGORY_OPTIONS,
  CONTACT_LOGIN_HREF,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_PRIVACY_COPY,
  CONTACT_REPLY_TO_MAX_LENGTH,
} from "./schema";
import { submitContactAction, type ContactActionState } from "@/app/actions/contact";

// "use server" のファイルは関数しか export できないため、初期状態はここに置く。
const INITIAL_STATE: ContactActionState = { status: "idle" };

export interface ContactFormProps {
  /** `?spot=<id>` で指定された、公開中のスポット。見つからなければ null。 */
  spot: { id: string; name: string; cityName: string } | null;
  /**
   * ログイン中か。個人情報の請求（privacy）は、ログイン中ならそのアカウントのご本人からの請求として受け付け、
   * 返信先の欄を出さない（アカウントのメールアドレス宛に回答する。R21 軽微1）。未ログインなら返信先を必須にする
   * （運営が登録しているメールアドレスと照合し、そのアドレス宛に確認して本人確認する。R20 重要3・R21 重要2）。
   */
  isLoggedIn: boolean;
}

/** 文字数はコードポイント単位で数える（DB の char_length と揃える）。 */
function charLength(value: string): number {
  return Array.from(value).length;
}

/**
 * /contact のお問い合わせフォーム（SPEC §9.17）。
 * 送信は Server Action。成功したら入力欄を閉じて role="status" のお礼だけを残す。
 * 二重送信は、送信中のボタンを `aria-disabled`（フォーカスを失わせない）にし、
 * `isPending` の間は送信そのものを無視することで防ぐ。
 * フォーカス: 成功したらお礼の見出し（tabIndex=-1）へ、失敗したら最初の不正な入力欄へ移す。
 * 成功時の文言は用件で変える（privacy は返信を約束しない旨を出さず「本人確認のうえ回答します。」）。
 */
export function ContactForm({ spot, isLoggedIn }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(submitContactAction, INITIAL_STATE);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string>("");

  const successHeadingRef = useRef<HTMLHeadingElement>(null);
  const categoryFieldsetRef = useRef<HTMLFieldSetElement>(null);
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const replyToRef = useRef<HTMLInputElement>(null);

  // 送信の結果が変わるたびにフォーカスを移す（成功した見出しは入力欄を閉じた後に現れる）。
  useEffect(() => {
    if (state.status === "success") {
      successHeadingRef.current?.focus();
      return;
    }
    if (state.status !== "error") return;
    // 用件は、選んでいる選択肢（無ければ最初の選択肢）へ。
    const target =
      state.field === "category"
        ? (categoryFieldsetRef.current?.querySelector<HTMLInputElement>('input[name="category"]:checked') ??
          categoryFieldsetRef.current?.querySelector<HTMLInputElement>('input[name="category"]') ??
          null)
        : state.field === "message"
          ? messageRef.current
          : state.field === "replyTo"
            ? replyToRef.current
            : null;
    target?.focus();
  }, [state]);

  const baseId = useId();
  const messageId = `${baseId}-message`;
  const messageErrorId = `${baseId}-message-error`;
  const messageCounterId = `${baseId}-message-counter`;
  const replyToId = `${baseId}-reply-to`;
  const replyToErrorId = `${baseId}-reply-to-error`;
  const replyToHintId = `${baseId}-reply-to-hint`;
  const categoryErrorId = `${baseId}-category-error`;
  const categoryLegendId = `${baseId}-category-legend`;
  const privacyNoteId = `${baseId}-privacy-note`;

  const remaining = CONTACT_MESSAGE_MAX_LENGTH - charLength(message);
  const fieldError = state.status === "error" ? state.field : undefined;
  const formError = state.status === "error" && state.field === undefined ? state.message : null;
  // 個人情報の請求: 未ログインなら経路（ログイン／返信先を書いて運営が照合・確認）を案内し、返信先を必須にする。
  // ログイン中なら返信先の欄を出さず（送らない）、アカウントのメールアドレス宛に回答すると案内する。
  const isPrivacy = category === "privacy";
  const isGuestPrivacy = isPrivacy && !isLoggedIn;
  const isMemberPrivacy = isPrivacy && isLoggedIn;
  const categoryErrorMessage = fieldError === "category" && state.status === "error" ? state.message : null;
  const replyToHint = isGuestPrivacy
    ? CONTACT_PRIVACY_COPY.guestReplyToHint
    : "返信が必要な場合だけ、ご記入ください。";

  if (state.status === "success") {
    return (
      <Card>
        <div role="status">
          <h2 ref={successHeadingRef} tabIndex={-1} className="m-0">
            お送りしました。ありがとうございます。
          </h2>
        </div>
        <p className="m-0 text-sm text-muted">
          {state.category === "privacy"
            ? "本人確認のうえ回答します。"
            : "返信をお約束するものではありません。掲載停止のご連絡は、内容を確認でき次第、対応します。"}
        </p>
      </Card>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmit={(event) => {
        // action 属性の経路に任せると、React が送信後にフォームをリセットし、失敗したときに
        // 選んだ用件や返信先が消えてしまう。JS が動いているときはここで送り、リセットさせない
        // （action 属性は JS が動く前の送信のために残す）。
        event.preventDefault();
        // 送信中の再送信は受け付けない（ボタンは aria-disabled のままフォーカスを保つ）。
        if (isPending) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {spot ? (
        <Card kicker="この店について" title={spot.name} meta={spot.cityName}>
          <input type="hidden" name="spotId" value={spot.id} />
        </Card>
      ) : null}

      <fieldset
        ref={categoryFieldsetRef}
        className="space-y-2"
        style={{ border: 0, padding: 0, margin: 0 }}
        aria-describedby={
          [categoryErrorMessage ? categoryErrorId : null, isPrivacy ? privacyNoteId : null]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        <legend id={categoryLegendId} className="text-sm text-muted">
          用件
        </legend>
        {CONTACT_CATEGORY_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="radio"
            style={{ display: "flex", minHeight: 44, alignItems: "center" }}
          >
            <input
              type="radio"
              name="category"
              value={option.value}
              checked={category === option.value}
              onChange={() => setCategory(option.value)}
            />
            <span className="dot" aria-hidden="true" />
            <span>{option.label}</span>
          </label>
        ))}
        {/* 誤りではなく案内なので alert にはせず、選んだときに polite で読み上げる。 */}
        <div aria-live="polite">
          {isGuestPrivacy ? (
            <p id={privacyNoteId} className="text-sm m-0">
              {CONTACT_PRIVACY_COPY.guestNote} <Link href={CONTACT_LOGIN_HREF}>ログインする</Link>
            </p>
          ) : isMemberPrivacy ? (
            <p id={privacyNoteId} className="text-sm m-0">
              {CONTACT_PRIVACY_COPY.memberNote}
            </p>
          ) : null}
        </div>
        {categoryErrorMessage ? (
          <p id={categoryErrorId} role="alert" className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
            {categoryErrorMessage}
          </p>
        ) : null}
      </fieldset>

      <div className="field">
        <label htmlFor={messageId}>お問い合わせの内容（{CONTACT_MESSAGE_MAX_LENGTH}字まで）</label>
        <textarea
          ref={messageRef}
          id={messageId}
          name="message"
          className="input"
          // 複数行の入力欄は、1行用の丸い形だと文字が縁に寄って読みにくいので角を控えめにする
          style={{ borderRadius: "var(--radius-md)", paddingBlock: "10px" }}
          rows={8}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-invalid={fieldError === "message" ? true : undefined}
          aria-describedby={
            [messageCounterId, fieldError === "message" ? messageErrorId : null].filter(Boolean).join(" ")
          }
        />
        <div id={messageCounterId} className="field-counter">
          残り{remaining}字
        </div>
        {fieldError === "message" ? (
          <div id={messageErrorId} role="alert" className="field-hint" style={{ color: "var(--color-accent-700)" }}>
            {state.status === "error" ? state.message : null}
          </div>
        ) : null}
      </div>

      {/* ログイン中の個人情報の請求では、返信先の欄ごと出さない（使わない連絡先を入力・送信させない）。 */}
      {isMemberPrivacy ? null : (
        <div className="field">
          <label htmlFor={replyToId}>
            {isGuestPrivacy ? "返信用のメールアドレス（必須）" : "返信用のメールアドレス（任意）"}
          </label>
          <input
            ref={replyToRef}
            id={replyToId}
            name="replyTo"
            type="email"
            className="input"
            maxLength={CONTACT_REPLY_TO_MAX_LENGTH}
            style={{ minHeight: 44 }}
            // required 属性はブラウザ独自の吹き出しで送信を止めてしまうため使わず、検査はサーバーの文言で出す。
            aria-required={isGuestPrivacy || undefined}
            aria-invalid={fieldError === "replyTo" ? true : undefined}
            aria-describedby={
              [replyToHintId, fieldError === "replyTo" ? replyToErrorId : null].filter(Boolean).join(" ")
            }
          />
          <div id={replyToHintId} className="field-hint">
            {replyToHint}
          </div>
          {fieldError === "replyTo" ? (
            <div id={replyToErrorId} role="alert" className="field-hint" style={{ color: "var(--color-accent-700)" }}>
              {state.status === "error" ? state.message : null}
            </div>
          ) : null}
        </div>
      )}

      {formError ? (
        <p role="alert" className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          {formError}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        block
        style={{ minHeight: 44 }}
        aria-disabled={isPending || undefined}
      >
        送る
      </Button>
      <p className="text-sm text-muted m-0" aria-live="polite">
        {isPending ? "送信しています…" : null}
      </p>
    </form>
  );
}
