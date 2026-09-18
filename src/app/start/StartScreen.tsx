"use client";

import { useEffect, useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { AnimatedCounter } from "@/components/ui";
import { Disclaimer } from "@/components/profile/Disclaimer";
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

/** 夜の導入に散らす灯り（位置は決め打ちで、描画ごとに変わらない）。 */
const LIGHTS = Array.from({ length: 34 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  top: 38 + ((i * 53) % 55),
  size: 3 + (i % 4),
  delay: (i % 9) * 0.45,
  warm: i % 3 !== 0,
}));

/**
 * S1「街を選ぶ」（SPEC §9.15 案B「灯りのともる夜」）。
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
          <h1 className="m-0 text-xs tracking-[0.3em]" style={{ color: "var(--color-neutral-600)" }}>
            ウラスポ
          </h1>
          <p className="m-0 mt-4" style={{ color: "var(--color-neutral-800)" }}>
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
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(180deg, var(--color-neutral-900) 0%, var(--color-accent-900) 100%)",
          color: "var(--color-neutral-100)",
        }}
      >
        {/* Codex R8 重要4: 灯りの明滅・下の手順巡回を両方止められる切り替え（44px以上、控えめな見た目）。 */}
        <button
          type="button"
          aria-pressed={motionPaused}
          onClick={toggleMotion}
          className="start-motion-toggle absolute right-3 top-3 z-10"
        >
          {motionPaused ? "動きを再開する" : "動きを止める"}
        </button>

        <div aria-hidden className="absolute inset-0">
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
                background: light.warm ? "var(--color-accent-300)" : "var(--color-accent-2-300)",
                boxShadow: `0 0 ${light.size * 4}px ${light.size}px ${
                  light.warm
                    ? "color-mix(in srgb, var(--color-accent-400) 55%, transparent)"
                    : "color-mix(in srgb, var(--color-accent-2-400) 45%, transparent)"
                }`,
              }}
            />
          ))}
          {/* 稜線（明るい面へのつなぎ） */}
          <svg className="absolute inset-x-0 bottom-0 h-24 w-full" viewBox="0 0 1200 100" preserveAspectRatio="none">
            <path
              d="M0 70 L140 42 L260 60 L420 22 L560 55 L700 34 L860 62 L1000 28 L1200 58 L1200 100 L0 100 Z"
              fill="var(--color-bg)"
            />
          </svg>
        </div>

        <div className="relative mx-auto max-w-5xl px-5 pb-28 pt-12 lg:px-10 lg:pb-36 lg:pt-20">
          <p className="m-0 text-xs tracking-[0.3em]" style={{ color: "var(--color-accent-300)" }}>
            ウラスポ
          </p>
          <h1
            className="font-heading m-0 mt-4"
            style={{
              fontSize: "clamp(2.2rem, 5.6vw, 3.9rem)",
              fontWeight: 900,
              lineHeight: 1.2,
              color: "var(--color-neutral-100)",
            }}
          >
            北海道の、まだ静かな店を歩く
          </h1>
          <p className="m-0 mt-4 max-w-lg" style={{ color: "var(--color-neutral-300)" }}>
            住んでいる人が残した店だけを見せます。まだ静かなところから。
          </p>

          {/* 軽微1: 街を切り替えたときに件数の文章全体を読み上げる（AnimatedCounterのsr-only数字と
              二重にならないよう、この文の外側だけに aria-live を付ける）。 */}
          <p className="m-0 mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-1" aria-live="polite" aria-atomic="true">
            <span className="text-sm" style={{ color: "var(--color-neutral-300)" }}>
              {selectedCity.name}には、地元が確認したピンが
            </span>
            <span
              className="font-heading tabular-nums"
              style={{
                fontSize: "clamp(3.2rem, 9vw, 5.5rem)",
                fontWeight: 900,
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
      </section>

      <div className="mx-auto max-w-5xl px-5 lg:px-10">
        <section
          aria-labelledby="start-choose-city"
          className="relative -mt-10 rounded-[var(--radius-lg)] p-5 lg:p-8"
          style={{ background: "var(--color-neutral-100)", boxShadow: "var(--shadow-lg)" }}
        >
          <h2 id="start-choose-city" className="m-0 font-heading" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
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
                    className="rounded-full px-4 py-1.5 text-sm"
                    style={{
                      background: active ? "var(--color-neutral-900)" : "transparent",
                      color: active ? "var(--color-accent-200)" : "var(--color-neutral-800)",
                      border: `1px solid ${active ? "var(--color-neutral-900)" : "var(--color-neutral-600)"}`,
                    }}
                  >
                    {city.name}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h3 className="m-0 text-sm" style={{ fontSize: "0.875rem", fontWeight: 700, color: "var(--color-neutral-700)" }}>
                今週、静けさが確認された店
              </h3>
              {selectedData.recentlyVerified.length > 0 ? (
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-sm" style={{ color: "var(--color-neutral-800)" }}>
                  {selectedData.recentlyVerified.map((item) => (
                    <li key={item.spotId}>
                      <span aria-hidden style={{ color: "var(--color-accent-2-700)" }}>
                        ●{" "}
                      </span>
                      {item.spotName}
                      <span className="ml-2 text-xs" style={{ color: "var(--color-neutral-700)" }}>
                        今週 {item.verifierCount}人が確認
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 mt-2 text-sm" style={{ color: "var(--color-neutral-700)" }}>
                  今週はまだ確認がありません。
                </p>
              )}
            </div>
            <div className="lg:text-right">
              <button
                type="button"
                onClick={startWalking}
                disabled={isStarting}
                className="btn btn-primary w-full lg:w-auto"
                style={{ minHeight: 52, paddingInline: 32, fontSize: "1rem" }}
              >
                歩きはじめる
              </button>
              {errorMessage ? (
                <p role="alert" className="m-0 mt-2 text-sm" style={{ color: "var(--color-accent-700)" }}>
                  {errorMessage}
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section aria-labelledby="start-how" className="mt-16">
          <h2 id="start-how" className="m-0 font-heading" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
            静けさは、こうして保たれます
          </h2>
          <ol className="m-0 mt-5 grid list-none gap-4 p-0 lg:grid-cols-3">
            {STEPS.map((step, i) => {
              const on = i === activeStep;
              return (
                <li
                  key={step.title}
                  className="relative overflow-hidden transition-colors duration-500"
                  style={{
                    padding: "18px 18px 20px",
                    borderRadius: "var(--radius-md)",
                    background: on ? "var(--color-accent-100)" : "var(--color-neutral-100)",
                    border: `1px solid ${on ? "var(--color-accent-500)" : "var(--color-neutral-300)"}`,
                  }}
                >
                  <span
                    aria-hidden
                    className="font-heading tabular-nums"
                    style={{ fontSize: "2rem", fontWeight: 900, color: on ? "var(--color-accent-700)" : "var(--color-neutral-600)" }}
                  >
                    {i + 1}
                  </span>
                  <h3 className="m-0 mt-1 font-heading" style={{ fontSize: "1rem", fontWeight: 700 }}>
                    {step.title}
                  </h3>
                  <p className="m-0 mt-1 text-sm" style={{ color: "var(--color-neutral-700)" }}>
                    {step.body}
                  </p>
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-1"
                    style={{
                      width: on ? "100%" : "0%",
                      background: "var(--color-accent-500)",
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

        <footer className="mt-12">
          <Disclaimer />
        </footer>
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
