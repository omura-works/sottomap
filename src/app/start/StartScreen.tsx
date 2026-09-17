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
  const activeStep = useCycle(STEPS.length, STEP_INTERVAL_MS);

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

          <p className="m-0 mt-10 flex flex-wrap items-baseline gap-x-3 gap-y-1">
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
                      transition: on ? `width ${STEP_INTERVAL_MS}ms linear` : "none",
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

/** 一定間隔で 0..n-1 を巡回する（動きを減らす設定では最初の手順のまま止める）。 */
function useCycle(n: number, intervalMs: number) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % n), intervalMs);
    return () => window.clearInterval(id);
  }, [n, intervalMs]);
  return index;
}
