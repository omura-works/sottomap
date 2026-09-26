"use client";

import { useEffect, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { LogoMark } from "@/components/brand/LogoMark";
import { AnimatedCounter } from "@/components/ui";
import { saveHomeCityAction } from "@/app/actions/start";
import "./start.css";

export interface StartCityOption {
  slug: string;
  name: string;
}

export interface StartRecentlyVerifiedItem {
  spotId: string;
  spotName: string;
  verifierCount: number;
}

export interface StartCityData {
  publishedCount: number;
  recentlyVerified: StartRecentlyVerifiedItem[];
}

/** SPEC §9.15-3: §1 の思想を3つの手順で順に灯す。 */
const STEPS = [
  { title: "住んでいる人が、ピンを残す", body: "掲載しているのは実在の店名と、公開情報にある事実だけ" },
  { title: "同じ街の2人がうなずく", body: "同じ街の2人が『行ったことがある』と答えると、地図に出ます" },
  { title: "90日ごとに、確かめ続ける", body: "90日ごとに、あなたに一度だけ確認が届きます" },
] as const;

const STEP_INTERVAL_MS = 2800;

/** 夜の導入（暗い角丸カード）に散らす小さな灯り（位置は決め打ちで、描画ごとに変わらない）。 */
const LIGHTS = Array.from({ length: 16 }, (_, i) => ({
  left: 4 + ((i * 37 + 11) % 92),
  top: 8 + ((i * 53) % 84),
  size: 2 + (i % 3),
  delay: (i % 9) * 0.45,
  warm: i % 3 !== 0,
}));

/**
 * S1「街を選ぶ」（SPEC §9.15 案B「灯りのともる夜」。2026-09-26 に暗い角丸カードのヒーローへ収めた）。
 * 街ごとの実データ（公開ピン数・今週確認された店）はサーバー側で事前に
 * まとめて取得し（`page.tsx`）、街チップの切り替えは追加の通信なしで即座に切り替える。
 */
export function StartScreen({
  cities,
  dataBySlug,
  defaultCitySlug,
}: {
  cities: StartCityOption[];
  dataBySlug: Record<string, StartCityData>;
  defaultCitySlug: string;
}) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(defaultCitySlug);
  const [isStarting, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Codex R8 重要4・軽微1・Codex R9 重要4・Codex R10 重要3: 灯りの明滅・手順の巡回はどちらも
  // 5秒を超える自動運動のため、止める手段が必要（WCAG 2.2.2）。既定は prefers-reduced-motion に
  // 従い、表示中の変更にも追従するが、利用者が明示的に選んだ状態（userChoice）はOS設定の変化で
  // 上書きしない。SSR・マウント直後（OS設定をまだ読んでいない間）は "auto"（既定=動く。ただし
  // OS設定は CSS の media query 側で効く）を返し、ハイドレーション不一致を避ける。
  const { motionState, effectivePaused, toggleMotion } = useMotionState();
  // ボタンの見た目（止める/再開する）は実効停止状態にのみ従う（"auto" は "playing" と同じ扱い）。
  const motionPaused = motionState === "paused";
  const activeStep = useCycle(STEPS.length, STEP_INTERVAL_MS, effectivePaused);

  // R13レビュー重要4: 参照データ（街）の投入前・投入失敗時に選択都市が undefined になり
  // 以降の `.name` 参照で落ちるのを防ぐ。街が1件も無い場合は選択・開始のUIを出さず、
  // 空状態だけを表示する。
  if (cities.length === 0) {
    return (
      // main ランドマークは AppShell が既に出しているので、ここでは重ねない。
      <div
        className="start-screen flex min-h-dvh items-center justify-center px-5 text-center"
        style={{ background: "var(--color-bg)" }}
      >
        <div>
          <h1 className="tracking-[0.3em]" style={{ margin: 0, fontSize: "0.75rem", color: "var(--color-neutral-700)" }}>
            ウラスポ
          </h1>
          <p style={{ margin: "16px 0 0", color: "var(--color-neutral-800)" }}>
            まだ街が準備されていません。しばらくしてからもう一度お試しください。
          </p>
        </div>
      </div>
    );
  }

  const selectedCity = cities.find((city) => city.slug === selectedSlug) ?? cities[0];
  const selectedData = dataBySlug[selectedSlug] ?? { publishedCount: 0, recentlyVerified: [] };

  const startWalking = () => {
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await saveHomeCityAction(selectedSlug);
        router.push(`/${selectedSlug}`);
      } catch (error) {
        unstable_rethrow(error);
        setErrorMessage("街を保存できませんでした。もう一度お試しください。");
      }
    });
  };

  return (
    <div
      className="start-screen min-h-dvh"
      // Codex R9 重要4: CSS側はこの data-motion を prefers-reduced-motion より優先して見る
      // （利用者が「動きを再開する」を押せば、OSがreduceでも灯りを動かせるようにするため）。
      data-motion={motionState}
      // SPEC §9.12-2: /start は下部タブを持たないが、端末のホームインジケータに末尾の注記が隠れないよう余白を取る。
      style={{ background: "var(--color-bg)", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
    >
      {/* ヘッダー（高さ72px・下に hairline）: 橙の細線の地図ピン＋「ウラスポ」 */}
      <div className="border-b" style={{ borderColor: "var(--color-divider)" }}>
        <div className="mx-auto flex h-[72px] max-w-6xl items-center gap-2.5 px-5 lg:px-10">
          <LogoMark size={26} />
          <p style={{ margin: 0, fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: 17, letterSpacing: "0.1em" }}>
            ウラスポ
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-5 lg:px-10 lg:pt-10">
        {/* SPEC §9.15-1 夜の導入: 暗い角丸カードに、細い地図の線・光のにじみ・灯りの点 */}
        {/* 暗い角丸の面は栞・灯りと共通の .night-card（globals.css） */}
        <section className="start-hero night-card">
          {/* Codex R8 重要4: 灯りの明滅・下の手順巡回を両方止められる切り替え（44px以上、控えめな見た目）。 */}
          <button
            type="button"
            aria-pressed={motionPaused}
            onClick={toggleMotion}
            className="start-motion-toggle absolute right-3 top-3 z-10 lg:right-5 lg:top-5"
          >
            {motionPaused ? "動きを再開する" : "動きを止める"}
          </button>

          <div aria-hidden className="pointer-events-none absolute inset-0">
            {/* 光のにじみ（暖色2つ） */}
            <span className="night-glow start-glow-a" />
            <span className="night-glow start-glow-b" />
            {/* 細く薄い地図の道の線 */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 1200 720"
              preserveAspectRatio="xMidYMid slice"
              fill="none"
              stroke="var(--color-neutral-100)"
              strokeLinecap="round"
            >
              <path d="M-40 560 L420 260 L760 150 L1260 -40" strokeWidth="1.2" strokeOpacity="0.14" />
              <path d="M-60 330 L300 470 L620 520 L1260 760" strokeWidth="1" strokeOpacity="0.1" />
              <path d="M180 -40 L360 300 L470 760" strokeWidth="1" strokeOpacity="0.09" />
              <path d="M700 -40 L820 260 L1000 420 L1260 470" strokeWidth="1" strokeOpacity="0.1" />
              <path d="M560 760 L780 470 L1040 300 L1260 250" strokeWidth="0.8" strokeOpacity="0.08" />
              <path d="M-40 120 C 180 160, 300 90, 520 130 S 860 60, 1260 110" strokeWidth="0.8" strokeOpacity="0.07" />
            </svg>
            {LIGHTS.map((light, i) => (
              <span
                key={i}
                className="start-light absolute rounded-full"
                style={{
                  left: `${light.left}%`,
                  top: `${light.top}%`,
                  width: light.size,
                  height: light.size,
                  animationDelay: `${light.delay}s`,
                  background: light.warm ? "var(--color-accent-400)" : "var(--color-neutral-100)",
                  boxShadow: `0 0 ${light.size * 3}px ${light.size * 0.6}px ${
                    light.warm
                      ? "color-mix(in srgb, var(--color-accent-400) 45%, transparent)"
                      : "color-mix(in srgb, var(--color-neutral-100) 30%, transparent)"
                  }`,
                }}
              />
            ))}
          </div>

          <div className="relative grid gap-10 px-6 pb-10 pt-16 sm:px-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-16 lg:px-16 lg:py-20">
            <div>
              {/* 見出しの上の短い細線のアクセント */}
              <span aria-hidden className="block h-px w-6" style={{ background: "var(--color-accent-400)" }} />
              <h1
                className="font-heading"
                style={{
                  margin: "24px 0 0",
                  fontSize: "clamp(1.85rem, 4vw, 3rem)",
                  fontWeight: 700,
                  lineHeight: 1.5,
                  letterSpacing: "0.06em",
                  color: "var(--color-neutral-100)",
                }}
              >
                {/* 行の切れ目を「北海道の、／まだ静かな店を歩く」にそろえる（読み上げは一続きのまま） */}
                <span className="inline-block">北海道の、</span>
                <span className="inline-block">まだ静かな店を歩く</span>
              </h1>
              <p className="max-w-xl" style={{ margin: "20px 0 0", color: "var(--color-neutral-300)", lineHeight: 1.9 }}>
                住んでいる人が残した店だけを見せます。まだ静かなところから。
              </p>

              {/* 軽微1: 街を切り替えたときに件数の文章全体を読み上げる（AnimatedCounterのsr-only数字と
                  二重にならないよう、この文の外側だけに aria-live を付ける）。 */}
              <p
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                style={{ margin: "40px 0 0" }}
                aria-live="polite"
                aria-atomic="true"
              >
                <span className="text-sm" style={{ color: "var(--color-neutral-300)" }}>
                  {selectedCity.name}には、地元が確認したピンが
                </span>
                <span
                  className="font-heading tabular-nums"
                  style={{
                    fontSize: "clamp(2.8rem, 7vw, 4.5rem)",
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "var(--color-accent-300)",
                  }}
                >
                  {/* SPEC §9.15-1: 街を切り替えると数字が回って変わる（Rare UI の AnimatedCounter） */}
                  <AnimatedCounter value={selectedData.publishedCount} />
                </span>
                <span className="text-sm" style={{ color: "var(--color-neutral-300)" }}>
                  件あります。
                </span>
              </p>
            </div>

            {/* SPEC §9.15-2 街を選ぶ: カードの中、細線で区切った右（モバイルは下）に置く */}
            <section
              aria-labelledby="start-choose-city"
              className="border-t pt-8 lg:border-l lg:border-t-0 lg:pl-16 lg:pt-0"
              style={{ borderColor: "color-mix(in srgb, var(--color-neutral-100) 14%, transparent)" }}
            >
              <h2
                id="start-choose-city"
                className="font-heading"
                style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, letterSpacing: "0.06em", color: "var(--color-neutral-100)" }}
              >
                どの街を歩きますか
              </h2>
              <div role="group" aria-label="街を選ぶ" className="mt-3 flex flex-wrap gap-x-1.5">
                {cities.map((city) => {
                  const active = city.slug === selectedSlug;
                  return (
                    // SPEC §9.14-14: 見た目のチップを 44px 以上の透明なボタンで包む
                    <button
                      key={city.slug}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSelectedSlug(city.slug)}
                      className="start-city-chip inline-flex items-center"
                    >
                      <span
                        className="rounded-full px-4 py-1.5 text-sm tracking-[0.04em]"
                        style={{
                          background: active ? "var(--color-accent-600)" : "transparent",
                          color: active ? "var(--color-neutral-100)" : "var(--color-neutral-200)",
                          border: `1px solid ${
                            active
                              ? "var(--color-accent-600)"
                              : "color-mix(in srgb, var(--color-neutral-100) 32%, transparent)"
                          }`,
                        }}
                      >
                        {city.name}
                      </span>
                    </button>
                  );
                })}
              </div>

              <h3
                style={{
                  margin: "32px 0 0",
                  fontSize: "0.8125rem",
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  color: "var(--color-neutral-300)",
                }}
              >
                今週、静けさが確認された店
              </h3>
              {selectedData.recentlyVerified.length > 0 ? (
                <ul className="m-0 mt-3 flex list-none flex-col gap-1.5 p-0 text-sm" style={{ color: "var(--color-neutral-100)" }}>
                  {selectedData.recentlyVerified.map((item) => (
                    <li key={item.spotId}>
                      <span aria-hidden style={{ color: "var(--color-accent-2-300)" }}>
                        ●{" "}
                      </span>
                      {item.spotName}
                      <span className="ml-2 text-xs" style={{ color: "var(--color-neutral-400)" }}>
                        今週 {item.verifierCount}人が確認
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm" style={{ margin: "12px 0 0", color: "var(--color-neutral-300)" }}>
                  今週はまだ確認がありません。
                </p>
              )}

              <div className="mt-8">
                <button
                  type="button"
                  onClick={startWalking}
                  disabled={isStarting}
                  className="btn btn-primary w-full lg:w-auto"
                  style={{ minHeight: 52, paddingInline: 36, fontSize: "0.9375rem" }}
                >
                  歩きはじめる
                </button>
                {errorMessage ? (
                  <p role="alert" className="text-sm" style={{ margin: "8px 0 0", color: "var(--color-accent-300)" }}>
                    {errorMessage}
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        </section>

        <section aria-labelledby="start-how" style={{ marginTop: "var(--space-section)" }}>
          <span aria-hidden className="block h-px w-6" style={{ background: "var(--color-accent)" }} />
          <h2
            id="start-how"
            className="font-heading"
            style={{ margin: "16px 0 0", fontSize: "1.25rem", fontWeight: 700, letterSpacing: "0.06em" }}
          >
            静けさは、こうして保たれます
          </h2>
          <ol className="m-0 mt-6 grid list-none gap-4 p-0 lg:grid-cols-3 lg:gap-5">
            {STEPS.map((step, i) => {
              const on = i === activeStep;
              return (
                <li
                  key={step.title}
                  className="relative overflow-hidden transition-colors duration-500"
                  style={{
                    padding: "22px 22px 24px",
                    borderRadius: 14,
                    // 灯っている手順だけ、ごく淡い橙（accent-100）の面にする（選択中の扱い）
                    background: on ? "var(--color-accent-100)" : "var(--color-neutral-100)",
                    border: `1px solid ${on ? "color-mix(in srgb, var(--color-accent-600) 55%, transparent)" : "var(--color-divider)"}`,
                  }}
                >
                  <span
                    aria-hidden
                    className="font-heading tabular-nums"
                    style={{
                      fontSize: "1.75rem",
                      fontWeight: 700,
                      lineHeight: 1.2,
                      color: on ? "var(--color-accent-600)" : "var(--color-neutral-500)",
                    }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="font-heading" style={{ margin: "8px 0 0", fontSize: "1rem", fontWeight: 700, letterSpacing: "0.05em" }}>
                    {step.title}
                  </h3>
                  <p className="text-sm" style={{ margin: "6px 0 0", color: "var(--color-text-muted)", lineHeight: 1.8 }}>
                    {step.body}
                  </p>
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-0.5"
                    style={{
                      width: on ? "100%" : "0%",
                      background: "var(--color-accent-600)",
                      // Codex R9 重要4・R10 重要3: 実効状態が停止なら幅アニメーションもしない
                      // （transitionを切り、途中の遷移で止まらないようにする）。
                      transition: on && !effectivePaused ? `width ${STEP_INTERVAL_MS}ms linear` : "none",
                    }}
                  />
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

/**
 * 一定間隔で 0..n-1 を巡回する（`paused` の間は最後に止まった手順のまま止める）。
 * Codex R8 重要4: 「動きを止める」ボタン・`prefers-reduced-motion` のどちらでも止められるよう、
 * 判定は呼び出し側（`useMotionPreference`）にまとめ、ここでは単純な bool だけ受け取る。
 */
function useCycle(n: number, intervalMs: number, paused: boolean) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), intervalMs);
    return () => window.clearInterval(id);
  }, [n, intervalMs, paused]);
  return index;
}

/**
 * 「動きを止める」トグルの実効状態。
 * Codex R9 重要4・Codex R10 重要3: OS設定（`prefers-reduced-motion`）と利用者の明示的な選択
 * （userChoice）を別々に持ち、実効状態は「userChoiceがあればそれ、無ければOS設定」で決める。
 * これにより、手動停止後にOS設定が reduce:false へ変わっても停止のまま維持され、
 * 逆にOSが reduce のままでも利用者が「動きを再開する」を押せば動く（WCAG 2.2.2の pause は
 * 利用者が再開を求めるまで再開しない状態のため）。
 *
 * SSR・マウント直後（`matchMedia` をまだ読んでいない間）は `osReduceMotion` を null に保ち、
 * `motionState` は "auto" を返す。"auto" は「既定では動くが、OSの prefers-reduced-motion:
 * reduce が効く」を意味し、CSS 側の media query がJS無効でも初期描画に反映できるようにする
 * （R10 重要3: 以前は SSR で常に "playing" を出力していたため、JS実行前は reduced-motion
 * 利用者でも灯りが動いていた）。
 * `effectivePaused` は手順の自動巡回の開始判定にも使い、`osReduceMotion` が未確定（null）の間は
 * 巡回を始めない（マウント後に `matchMedia` を読んでから開始する）。
 */
function useMotionState(): {
  motionState: "auto" | "playing" | "paused";
  effectivePaused: boolean;
  toggleMotion: () => void;
} {
  const [osReduceMotion, setOsReduceMotion] = useState<boolean | null>(null);
  const [userChoice, setUserChoice] = useState<"paused" | "playing" | null>(null);

  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    // effect本体で同期的に setState しない（react-hooks/set-state-in-effect）。
    // マイクロタスクへずらして、change イベント経由の更新と同じ経路に揃える。
    queueMicrotask(() => {
      if (!cancelled) setOsReduceMotion(mql.matches);
    });
    // OS設定の変化は osReduceMotion だけを更新し、userChoice は上書きしない。
    const handleChange = (event: MediaQueryListEvent) => setOsReduceMotion(event.matches);
    mql.addEventListener("change", handleChange);
    return () => {
      cancelled = true;
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  const motionState: "auto" | "playing" | "paused" =
    userChoice ?? (osReduceMotion === null ? "auto" : osReduceMotion ? "paused" : "playing");
  // 巡回の開始判定用。userChoiceがあればそれに従い、無ければ「OS設定が読めるまでは止めておく」。
  const effectivePaused = userChoice !== null ? userChoice === "paused" : osReduceMotion === null ? true : osReduceMotion;
  // トグルは利用者に見えている状態（motionState）を反転させる（"auto" は見た目上「動いている」扱い）。
  // effectivePausedは巡回開始の内部判定用のため、matchMedia解決前は基準が異なり、ボタンの
  // 表示ラベルと食い違うことがある。
  const toggleMotion = () => {
    setUserChoice(motionState === "paused" ? "playing" : "paused");
  };

  return { motionState, effectivePaused, toggleMotion };
}
