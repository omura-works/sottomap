// "use client" 不要（サーバー部品からも使える）。

export interface WordmarkProps {
  /** 昼: 「そっと」墨・「マップ」accent-600。夜: 「そっと」neutral-100・「マップ」accent-300。 */
  tone?: "paper" | "night";
  /** 字の大きさ（px）。ヘッダー 22・フッター 24。 */
  size?: number;
  /** /start のヘッダーの初回表示で、「っ」だけが上から落ちて止まる（字は最初から見えている）。 */
  intro?: boolean;
  className?: string;
}

/**
 * ワードマーク「そっとマップ」（SPEC motion §2.9）。Mochiy で「そっと」と「マップ」を2色に。
 * 読み上げは sr-only の「そっとマップ」1回だけ（見た目の側は「っ」を分けているので aria-hidden）。
 */
export function Wordmark({ tone = "paper", size = 22, intro = false, className }: WordmarkProps) {
  return (
    <span className={["wordmark", className].filter(Boolean).join(" ")} data-tone={tone} style={{ fontSize: size }}>
      <span className="sr-only">そっとマップ</span>
      <span aria-hidden="true">
        <span className="wordmark-a">
          そ<span className={intro ? "wordmark-tsu verb-pop" : "wordmark-tsu"}>っ</span>と
        </span>
        <span className="wordmark-b">マップ</span>
      </span>
    </span>
  );
}
