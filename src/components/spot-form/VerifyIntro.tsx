// "use client" 不要（確認の画面の page.tsx からも VerifyForm からも使う）。
import type { CSSProperties, ReactNode } from "react";
import { PageLamp } from "@/components/motion/PageLamp";

/** 確認の画面の見出し（SPEC motion §5.7-1・2）: ページの灯り＋2つの札、h1。 */
export function VerifyHeading() {
  return (
    <div className="verify-heading">
      <p className="verify-kickers">
        <PageLamp />
        <span className="kicker-pill">地元の人へ</span>
        <span className="kicker-pill" data-tone="moss">
          90日ごとの確認
        </span>
      </p>
      <h1 className="verify-title">この店は、まだ隠れていますか</h1>
    </div>
  );
}

/**
 * 店のカード（SPEC motion §5.7-3）: 店名と「前回の確認から **N** 日」（数字がこの画面の山）。
 * `slot` を渡すと右上に判子の置き場（答えが受け付けられたら、そこに選んだ答えの判子が押される）。
 */
export function VerifyShopCard({
  spotName,
  daysSinceLast,
  kicker,
  slot,
  children,
}: {
  spotName: string;
  daysSinceLast: number;
  kicker?: string;
  slot?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card verify-shop verb-stick keep-visible" style={{ "--from-y": "-10px" } as CSSProperties}>
      {kicker ? <div className="card-kicker">{kicker}</div> : null}
      <p className="verify-shop-name">{spotName}</p>
      <p className="verify-days">
        前回の確認から
        <span className="verify-days-num verb-pop" style={{ "--d": "200ms" } as CSSProperties}>
          {daysSinceLast}
        </span>
        <b>日</b>
      </p>
      {children}
      {slot}
    </div>
  );
}
