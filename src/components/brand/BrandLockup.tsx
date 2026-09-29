// "use client" 不要（サーバー部品からも使える）。
import { LogoMark } from "./LogoMark";
import { Wordmark } from "./Wordmark";

export interface BrandLockupProps {
  tone?: "paper" | "night";
  /** ワードマークの字の大きさ（px）。ヘッダー 22・フッター 24。 */
  size?: number;
  /** /start のヘッダーの初回表示: ロゴの灯りが灯り、「っ」が落ちて止まる。 */
  intro?: boolean;
  className?: string;
}

/**
 * ロゴの印（焦げ茶の角丸正方形 40px・角丸 12px の中に `LogoMark` 高さ 22px）＋ワードマーク（間 10px）。
 * SPEC motion §2.9。リンクにするときは呼ぶ側で `<Link>` に包む。
 */
export function BrandLockup({ tone = "paper", size = 22, intro = false, className }: BrandLockupProps) {
  return (
    <span className={["brand-lockup", className].filter(Boolean).join(" ")} data-tone={tone}>
      <span className="brand-lockup-mark">
        <LogoMark size={22} strokeColor="var(--color-accent-500)" dotColor="var(--color-accent-400)" ignite={intro} />
      </span>
      <Wordmark tone={tone} size={size} intro={intro} />
    </span>
  );
}
