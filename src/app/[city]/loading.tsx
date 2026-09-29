import { MapUnderlay } from "@/components/map/MapUnderlay";
import { PageLamp } from "@/components/motion/PageLamp";

/**
 * 地図のロード中（SPEC motion §4.5）: 画面いっぱいの紙の地図。道の線が 1.2 秒で描かれて止まる。
 * 左上（PC は左の 360px の列）に見出しの札の骨格（点線の枠）とページの灯り。
 * 読み上げは LoadingScreen と同じ `role="status"`「読み込んでいます」。
 */
export default function Loading() {
  return (
    <div className="city-loading relative h-[calc(100dvh-4rem)] lg:h-screen lg:flex" aria-busy="true">
      <p role="status" className="sr-only">
        読み込んでいます
      </p>
      <div aria-hidden="true" data-testid="loading-skeleton" className="city-loading-card loading-draft">
        <div className="loading-draft-head">
          <PageLamp />
          <span className="loading-draft-line loading-draft-title" />
        </div>
        <span className="loading-draft-line" style={{ width: "55%" }} />
        <div className="city-loading-rows">
          {[0, 1, 2].map((row) => (
            <div key={row} className="loading-draft-row">
              <span className="loading-draft-thumb" />
              <span className="loading-draft-text">
                <span className="loading-draft-line" style={{ width: "62%" }} />
                <span className="loading-draft-line" style={{ width: "38%" }} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="relative min-w-0 flex-1 h-full">
        <MapUnderlay draw />
      </div>
    </div>
  );
}
