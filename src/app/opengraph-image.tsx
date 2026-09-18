import { ImageResponse } from "next/og";

// SPEC §9.15 トップ画面「案B 灯りのともる夜」の配色を流用したOGP画像。
// docs/design-reference/design-tokens.css: --color-neutral-900 / --color-accent-900 / --color-neutral-100。
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          padding: "80px",
          background: "linear-gradient(180deg, #2e2b25 0%, #402310 100%)",
          color: "#f9f4ed",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 28, letterSpacing: 4, opacity: 0.8 }}>ウラスポ</div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            fontSize: 64,
            fontWeight: 700,
            marginTop: 24,
            lineHeight: 1.3,
          }}
        >
          <div style={{ display: "flex" }}>北海道の、</div>
          <div style={{ display: "flex" }}>まだ静かな店を歩く</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
