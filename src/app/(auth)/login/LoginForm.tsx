"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { sendLoginLink, type LoginActionState } from "./actions";

const INITIAL_STATE: LoginActionState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, action, pending] = useActionState(sendLoginLink, INITIAL_STATE);

  if (state.sent) {
    return <p className="text-sm">メールを送りました。届いたリンクを開いてください。</p>;
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />
      <label className="block space-y-2">
        <span className="text-sm">メールアドレス</span>
        <input
          className="input w-full"
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
        <p role="alert" className="text-sm" style={{ color: "var(--color-accent-700)" }}>
          {state.error}
        </p>
      ) : null}
      <Button type="submit" variant="primary" block disabled={pending}>
        ログイン用リンクを送る
      </Button>
    </form>
  );
}
