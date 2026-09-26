export interface LogoMarkProps {
  /** 表示の高さ（px）。幅はピンの縦横比（36:40）から決まる。 */
  size?: number;
  className?: string;
}

/**
 * ウラスポのロゴマーク: 橙の細線で描いた地図ピン（中に小さな点）。
 * アイコン（src/app/icon.svg）と同じ形から、背景の角丸正方形を外してピンの線と点だけを使う。
 * 装飾なので読み上げない（隣に「ウラスポ」の文字を置く前提）。
 */
export function LogoMark({ size = 24, className }: LogoMarkProps) {
  return (
    <svg
      viewBox="14 12 36 40"
      width={(size * 36) / 40}
      height={size}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 14c-7.2 0-13 5.6-13 12.6C19 36 32 50 32 50s13-14 13-23.4C45 19.6 39.2 14 32 14z"
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle cx={32} cy={27} r={3.4} fill="var(--color-accent-500)" />
    </svg>
  );
}
