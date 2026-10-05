import Link from "next/link";
import type { CSSProperties } from "react";
import { PageTransition } from "@/components/motion/PageTransition";
import { PageLamp } from "@/components/motion/PageLamp";
import { LanternChild } from "@/components/illustrations/LanternChild";
import { WalkPath } from "@/components/illustrations/WalkPath";

/** 途中で「？」の形に曲がって途切れる道（SPEC motion §5.14）。 */
const LOST_PATH = "M8 110 C 70 110, 110 80, 170 86 S 250 110, 280 80 C 300 60, 300 34, 282 28 C 266 22, 252 34, 256 48";

// SPEC 本番公開前指示書 §2: 404 は日本語で、トップ／地図へ戻る導線を出す。
// 内部のエラーメッセージやスタックは出さない（見せるものが無いため安全）。
// SPEC motion §5.14: 道に迷った灯りの子（迷ったことを責めない）。道が描かれ、道の先で灯りの子が跳ねて現れ、
// きょろきょろして2回まばたきし、3.2 秒以内に止まる。
export default function NotFound() {
  return (
    <PageTransition>
      <div className="nf-screen mx-auto max-w-xl px-4 py-10">
        <div className="nf-art" aria-hidden="true">
          <WalkPath d={LOST_PATH} viewBox="0 0 360 140" preserveAspectRatio="xMinYMid meet" draw duration={900} className="nf-path" />
          <LanternChild size={56} blink={false} className="nf-child verb-pop" style={{ "--from-scale": "0.6", "--d": "900ms" } as CSSProperties} />
        </div>
        <h1 className="nf-title">
          <PageLamp />
          あれ、この道の先にはページがありませんでした
        </h1>
        <p className="nf-lead">移動したか、なくなってしまったのかもしれません。</p>
        <div className="nf-actions verb-stick keep-visible" style={{ "--d": "600ms" } as CSSProperties}>
          <Link href="/start" transitionTypes={["page-forward"]} className="btn btn-primary">
            トップへ戻る
          </Link>
          <Link href="/sapporo" transitionTypes={["page-forward"]} className="btn btn-secondary">
            地図を見る
          </Link>
        </div>
      </div>
    </PageTransition>
  );
}
