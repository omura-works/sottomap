import { ImageResponse } from "next/og";
import { loadOgFont } from "./_og/og-font";

// OGP画像（2026-09-26 の「落ち着いた上品なデザイン」: 焦げ茶の面・橙の細線のピン・生成りの見出し。書体はサイトと同じもの（src/app/_og/og-font.ts））。
// 色は docs/SPEC.md §5 のトークン: neutral-900 #2e2b25 / bg #f5ead8 / accent #c67139 / accent-500 #d67f48 /
// accent-400 #f6a06b / neutral-400 #c0b6a5。
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "そっとマップ 北海道の、まだ静かな店を歩く";

export default async function OpengraphImage() {
  // 書体はリポジトリに同梱したファイルから読む（ネットワークに頼らない。src/app/_og/og-font.ts）
  const font = await loadOgFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: "#2e2b25",
          color: "#f5ead8",
          fontFamily: font.name,
        }}
      >
        {/* 右上の暖色の光のにじみと、灯りの点 */}
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -220,
            width: 640,
            height: 640,
            // satori は closest-side を解釈しないため、円の中心から 50% で透明になる形で書く
            backgroundImage: "radial-gradient(circle at center, rgba(214,127,72,0.34) 0%, rgba(214,127,72,0) 50%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 260,
            top: 120,
            width: 8,
            height: 8,
            borderRadius: 9999,
            background: "#f6a06b",
            boxShadow: "0 0 18px 6px rgba(246,160,107,0.45)",
          }}
        />
        <div style={{ position: "absolute", right: 150, top: 250, width: 6, height: 6, borderRadius: 9999, background: "#ffe1d0" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 96px", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width={50} height={56} viewBox="14 12 36 40">
              <path
                d="M32 14c-7.2 0-13 5.6-13 12.6C19 36 32 50 32 50s13-14 13-23.4C45 19.6 39.2 14 32 14z"
                fill="none"
                stroke="#d67f48"
                strokeWidth={2.6}
                strokeLinejoin="round"
              />
              <circle cx={32} cy={27} r={3.4} fill="#f6a06b" />
            </svg>
            <div style={{ display: "flex", fontSize: 34, fontWeight: 400, letterSpacing: 5 }}>そっとマップ</div>
          </div>
          <div style={{ display: "flex", width: 36, height: 2, background: "#f6a06b", marginTop: 56 }} />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 72,
              fontWeight: 400,
              letterSpacing: 5,
              lineHeight: 1.4,
              marginTop: 32,
            }}
          >
            <div style={{ display: "flex" }}>北海道の、</div>
            <div style={{ display: "flex" }}>まだ静かな店を歩く</div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [font],
    },
  );
}
