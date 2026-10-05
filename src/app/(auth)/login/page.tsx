import { LoginForm } from "./LoginForm";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";
import { Wordmark } from "@/components/brand/Wordmark";
import { LampDots } from "@/components/illustrations/LampDots";
import { Lantern } from "@/components/illustrations/Lantern";
import { NightRidge } from "@/components/illustrations/NightRidge";
import { RoadLines } from "@/components/illustrations/RoadLines";

interface LoginPageProps {
  searchParams: Promise<{ next?: string; error?: string }>;
}

/**
 * /login（SPEC motion §5.9）。夜から入る: 夜の地平線の上に、紙のカードが貼られる。
 * 送れたら封筒が点線に沿って夜空へ飛んでいく（LoginForm）。
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next, error } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/start";

  return (
    <PageTransition>
      <div className="login-night">
        <div className="login-night-deco" aria-hidden="true">
          <RoadLines />
          <LampDots count={10} ignite />
          <NightRidge className="login-night-ridge" backdrop="var(--color-neutral-900)" />
        </div>
        <div className="login-card verb-stick keep-visible">
          <header className="login-head">
            <p className="login-kicker">
              <PageLamp />
              <Wordmark size={18} />
            </p>
            <h1 className="login-title">ログイン</h1>
            <p className="login-lead">メールに届くリンクから、歩きつづけられます。パスワードはいりません。</p>
          </header>
          {error ? (
            <p role="alert" className="inline-alert alert-in text-sm">
              <Lantern size={16} tone="paper" />
              ごめんなさい、ログインできませんでした。もう一度ためしてみてください。
            </p>
          ) : null}
          <LoginForm nextPath={nextPath} />
        </div>
      </div>
    </PageTransition>
  );
}
