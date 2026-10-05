"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { CSSProperties } from "react";
import { Button, Input } from "@/components/ui";
import { Envelope } from "@/components/illustrations/Envelope";
import { Lantern } from "@/components/illustrations/Lantern";
import { WalkPath } from "@/components/illustrations/WalkPath";
import { sendLoginLink, type LoginActionState } from "./actions";

const INITIAL_STATE: LoginActionState = {};
/** 封筒からカードの右上の角へ伸びる点線（封筒が飛ぶ道。SPEC motion §5.9）。 */
const ENVELOPE_PATH = "M0 36 C 30 30, 60 10, 96 -20";

/**
 * ログインのフォーム（SPEC motion §5.9）。右上の封筒は、送れたら点線に沿って夜空へ飛んでいき消える
 * （封筒は送った後も DOM に残す）。送った後の文は封筒の 200ms 後に貼られる。
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(sendLoginLink, INITIAL_STATE);

  return (
    <div className="login-form-wrap">
      <span className="login-envelope-wrap" aria-hidden="true">
        <WalkPath d={ENVELOPE_PATH} viewBox="0 -20 96 56" draw delay={300} className="login-envelope-path" />
        <Envelope width={48} className={state.sent ? "login-envelope is-sent" : "login-envelope"} />
      </span>
      {state.sent ? (
        <p className="login-sent verb-stick" style={{ "--d": "200ms" } as CSSProperties}>
          メールを送りました！届いたリンクを開いてくださいね。
        </p>
      ) : (
        <form action={action} className="login-form">
          <input type="hidden" name="next" value={nextPath} />
          <label className="login-email">
            <span className="text-sm">メールアドレス</span>
            <Input
              underline
              className="w-full"
              type="email"
              name="email"
              autoComplete="email"
              required
              aria-describedby="login-email-note"
            />
          </label>
          {/* R19 軽微: メールを受け取る前に、利用目的と規約・プライバシーポリシーへの導線を置く。 */}
          <p id="login-email-note" className="text-muted text-sm m-0">
            メールアドレスはログインのためだけに使います。
            <Link href="/terms">利用規約</Link>・<Link href="/privacy">プライバシーポリシー</Link>
          </p>
          {state.error ? (
            <p role="alert" className="inline-alert alert-in text-sm">
              <Lantern size={16} tone="paper" />
              {state.error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" size="lg" block disabled={pending}>
            ログイン用リンクを送る
          </Button>
        </form>
      )}
    </div>
  );
}
