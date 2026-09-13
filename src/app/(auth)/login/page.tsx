import { LoginForm } from "./LoginForm";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/start";

  return (
    <div className="mx-auto max-w-md px-4 py-10 lg:py-16 space-y-6">
      <header className="space-y-2">
        <p className="text-muted text-xs tracking-wide uppercase">ウラスポ</p>
        <h1>ログイン</h1>
        <p className="text-muted">メールに届くリンクから、歩きつづけられます。</p>
      </header>
      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-accent-700)" }}>
          ログインできませんでした。もう一度お試しください。
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </div>
  );
}
