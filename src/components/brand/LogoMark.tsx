import { useSvgId } from "@/components/illustrations/svg-id";

export interface LogoMarkProps {
  /** 表示の高さ（px）。幅はピンの縦横比（36:40）から決まる。 */
  size?: number;
  /**
   * svg に付けるクラス。`is-breathing` を付けると灯りの光が2周だけ呼吸する（SPEC motion §4.1.1・§2.9）。
   */
  className?: string;
  /** ピンの線の色（既定は accent）。暗い地に置くときは明るめ（accent-500）にする。 */
  strokeColor?: string;
  /** 灯りの点の色（既定は accent-500）。 */
  dotColor?: string;
  /** 描かれたときに灯りの点が灯る（芯 240ms・光 480ms。/start のヘッダーの初回表示）。 */
  ignite?: boolean;
}

/**
 * そっとマップのロゴマーク: 橙の細線で描いた地図ピン（中に小さな灯りの点）。
 * アイコン（src/app/icon.svg）と同じ形から、背景の角丸正方形を外してピンの線と点だけを使う。
 * 点の後ろに光の層（accent-400 55%→0 の放射）を置き、この点を「生きている灯り」としてサイト中を渡らせる。
 * 装飾なので読み上げない（隣に「そっとマップ」の文字を置く前提）。
 */
export function LogoMark({
  size = 24,
  className,
  strokeColor = "var(--color-accent)",
  dotColor = "var(--color-accent-500)",
  ignite = false,
}: LogoMarkProps) {
  const glowId = useSvgId("lamp-glow");
  return (
    <svg
      viewBox="14 12 36 40"
      width={(size * 36) / 40}
      height={size}
      className={["logo-mark", className].filter(Boolean).join(" ")}
      overflow="visible"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0" stopColor="var(--color-accent-400)" stopOpacity={0.55} />
          <stop offset="1" stopColor="var(--color-accent-400)" stopOpacity={0} />
        </radialGradient>
      </defs>
      <path
        d="M32 14c-7.2 0-13 5.6-13 12.6C19 36 32 50 32 50s13-14 13-23.4C45 19.6 39.2 14 32 14z"
        fill="none"
        stroke={strokeColor}
        strokeWidth={2.6}
        strokeLinejoin="round"
      />
      <circle
        className={ignite ? "logo-mark-glow verb-ignite-glow" : "logo-mark-glow"}
        cx={32}
        cy={27}
        r={7}
        fill={`url(#${glowId})`}
      />
      <circle className={ignite ? "logo-mark-dot verb-ignite" : "logo-mark-dot"} cx={32} cy={27} r={3.4} fill={dotColor} />
    </svg>
  );
}
