// "use client" 不要（承認待ちの一覧（サーバー）と EndorseButton（クライアント）の両方から使う）。
import { ENDORSEMENTS_REQUIRED } from "@/lib/domain/lifecycle";
import { HandLine } from "@/components/illustrations/HandLine";
import { Stamp } from "@/components/motion/Stamp";

/**
 * 「承認 N/2」と、その右の判子の枠2つ（SPEC motion §5.8-3）。押されている数だけ苔色の判子の中に ✓、残りは点線の空の円。
 * 枠は飾り（数は字で伝わる）なので aria-hidden。`pressIndex` の枠は「押す」を1回再生する（増えた直後）。
 */
export function EndorseMeter({ count, pressIndex }: { count: number; pressIndex?: number }) {
  return (
    <p className="endorse-meter">
      <span>
        承認 {count}/{ENDORSEMENTS_REQUIRED}
      </span>
      <span className="endorse-frames" aria-hidden="true">
        {Array.from({ length: ENDORSEMENTS_REQUIRED }, (_, i) =>
          i < count ? (
            <span key={i} className={i === pressIndex ? "endorse-frame verb-stamp" : "endorse-frame"}>
              <Stamp glyph="" tone="moss" size={26} />
              <HandLine variant="check" className="endorse-check" />
            </span>
          ) : (
            <span key={i} className="endorse-frame endorse-frame-empty" />
          ),
        )}
      </span>
    </p>
  );
}
