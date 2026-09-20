"use client";

import { useActionState, useId, useState } from "react";
import { Button, Card } from "@/components/ui";
import {
  CONTACT_CATEGORY_OPTIONS,
  CONTACT_MESSAGE_MAX_LENGTH,
  CONTACT_REPLY_TO_MAX_LENGTH,
} from "./schema";
import { submitContactAction, type ContactActionState } from "@/app/actions/contact";

// "use server" のファイルは関数しか export できないため、初期状態はここに置く。
const INITIAL_STATE: ContactActionState = { status: "idle" };

export interface ContactFormProps {
  /** `?spot=<id>` で指定された、公開中のスポット。見つからなければ null。 */
  spot: { id: string; name: string; cityName: string } | null;
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
 */
export function ContactForm({ spot }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(submitContactAction, INITIAL_STATE);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<string>("");

  const baseId = useId();
  const messageId = `${baseId}-message`;
  const messageErrorId = `${baseId}-message-error`;
  const messageCounterId = `${baseId}-message-counter`;
  const replyToId = `${baseId}-reply-to`;
  const replyToErrorId = `${baseId}-reply-to-error`;
  const replyToHintId = `${baseId}-reply-to-hint`;
  const categoryErrorId = `${baseId}-category-error`;
  const categoryLegendId = `${baseId}-category-legend`;

  const remaining = CONTACT_MESSAGE_MAX_LENGTH - charLength(message);
  const fieldError = state.status === "error" ? state.field : undefined;
  const formError = state.status === "error" && state.field === undefined ? state.message : null;

  if (state.status === "success") {
    return (
      <Card>
        <p className="m-0" role="status">
          お送りしました。ありがとうございます。
        </p>
        <p className="m-0 text-sm text-muted">
          返信をお約束するものではありません。掲載停止のご連絡は、確認のうえ速やかに対応します。
        </p>
      </Card>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmit={(event) => {
        // 送信中の再送信は受け付けない（ボタンは aria-disabled のままフォーカスを保つ）。
        if (isPending) event.preventDefault();
      }}
    >
      {spot ? (
        <Card kicker="この店について" title={spot.name} meta={spot.cityName}>
          <input type="hidden" name="spotId" value={spot.id} />
        </Card>
      ) : null}

      <fieldset
        className="space-y-2"
        style={{ border: 0, padding: 0, margin: 0 }}
        aria-describedby={fieldError === "category" ? categoryErrorId : undefined}
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
        {fieldError === "category" ? (
          <p id={categoryErrorId} role="alert" className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
            {state.status === "error" ? state.message : null}
          </p>
        ) : null}
      </fieldset>

      <div className="field">
        <label htmlFor={messageId}>お問い合わせの内容（{CONTACT_MESSAGE_MAX_LENGTH}字まで）</label>
        <textarea
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

      <div className="field">
        <label htmlFor={replyToId}>返信用のメールアドレス（任意）</label>
        <input
          id={replyToId}
          name="replyTo"
          type="email"
          className="input"
          maxLength={CONTACT_REPLY_TO_MAX_LENGTH}
          style={{ minHeight: 44 }}
          aria-invalid={fieldError === "replyTo" ? true : undefined}
          aria-describedby={
            [replyToHintId, fieldError === "replyTo" ? replyToErrorId : null].filter(Boolean).join(" ")
          }
        />
        <div id={replyToHintId} className="field-hint">
          返信が必要な場合だけ、ご記入ください。
        </div>
        {fieldError === "replyTo" ? (
          <div id={replyToErrorId} role="alert" className="field-hint" style={{ color: "var(--color-accent-700)" }}>
            {state.status === "error" ? state.message : null}
          </div>
        ) : null}
      </div>

      {formError ? (
        <p role="alert" className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="primary" block aria-disabled={isPending || undefined}>
        送る
      </Button>
      <p className="text-sm text-muted m-0" aria-live="polite">
        {isPending ? "送信しています…" : null}
      </p>
    </form>
  );
}
