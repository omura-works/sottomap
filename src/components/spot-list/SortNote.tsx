import type { CSSProperties } from "react";
import { Reveal } from "@/components/motion/Reveal";

/**
 * S3 検索末尾の注記「並び順について」（SPEC motion §5.3-8）。前に「ちょっとだけ、並び順の話を。」を置き、
 * 注記はオレンジの付箋（−1.5° 傾く）。画面に入ったら貼られる（`Reveal verb="stick"`）。
 * 本文は SPEC §1「プロダクトの思想」の該当行を一字一句そのまま使う（§9.8）。
 * 傾きは中の付箋が持ち、`Reveal` の包みは傾けない（貼る動きの傾きが二重にならないように）。
 */
export function SortNote() {
  return (
    <div className="sort-note">
      <p className="sort-note-lead">ちょっとだけ、並び順の話を。</p>
      <Reveal verb="stick" style={{ "--tilt": "0deg" } as CSSProperties}>
        <div className="sticky" data-tone="orange" style={{ "--tilt": "-1.5deg" } as CSSProperties}>
          <p className="sticky-kicker">並び順について</p>
          <p className="sticky-body">
            混みはじめた店は、検索結果の下へ静かに下がります。上に出るのは、地元がまだ静かだと答えた店だけです。
          </p>
        </div>
      </Reveal>
    </div>
  );
}
