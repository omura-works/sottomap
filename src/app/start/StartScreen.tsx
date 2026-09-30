"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { HandLine } from "@/components/illustrations/HandLine";
import { HokkaidoMap } from "@/components/illustrations/HokkaidoMap";
import { LampDots } from "@/components/illustrations/LampDots";
import { LanternChild } from "@/components/illustrations/LanternChild";
import { NightRidge } from "@/components/illustrations/NightRidge";
import { PromiseArt } from "@/components/illustrations/PromiseArt";
import type { PromiseArtKind } from "@/components/illustrations/PromiseArt";
import { RoadLines } from "@/components/illustrations/RoadLines";
import { BounceNumber } from "@/components/motion/BounceNumber";
import { PageLamp } from "@/components/motion/PageLamp";
import { Reveal } from "@/components/motion/Reveal";
import { Stamp } from "@/components/motion/Stamp";
import type { StampTone } from "@/components/motion/Stamp";
import { setIrisOrigin } from "@/components/motion/iris";
import { EASE, PEEL_EXIT, SPRING } from "@/components/motion/tokens";
import { Chip } from "@/components/ui/Chip";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
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

/** SPEC motion §5.1 やくそくの3枚（題は【やわらげる】、文は §1 の思想の原文【そのまま】）。 */
const PROMISES: ReadonlyArray<{ title: string; body: string; art: PromiseArtKind; tone: "orange" | "moss" | "night" }> = [
  { title: "ピンを立てられるのは、その街に住んでいる人だけ", body: "掲載しているのは実在の店名と、公開情報にある事実だけ", art: "pin", tone: "orange" },
  {
    title: "「行ったことある！」が2人そろうと、地図にぽん",
    body: "同じ街の2人が『行ったことがある』と答えると、地図に出ます",
    art: "faces",
    tone: "moss",
  },
  { title: "90日ごとに「まだ静か？」", body: "90日ごとに、あなたに一度だけ確認が届きます", art: "calendar", tone: "night" },
];

/** ピンの字の凡例（§5.1）。 */
const LEGEND: ReadonlyArray<{ glyph: string; tone: StampTone; tilt: number; name: string; note: string }> = [
  { glyph: "静", tone: "quiet", tilt: -4, name: "静かなまま", note: "地元の人が、まだ静かだって答えた店" },
  { glyph: "並", tone: "crowding", tilt: 3, name: "並びはじめた", note: "ちょっと知られてきたかも" },
  { glyph: "観", tone: "touristy", tilt: -2, name: "もう観光地になった", note: "観光のお客さんでにぎわう店" },
];

/** 初回表示の振り付け（§5.1 の時刻表）。字は最初から見えていて、transform だけで跳ねる。 */
const pop = (delay: number, fromY: string, fromScale: number): CSSProperties =>
  ({ "--d": `${delay}ms`, "--from-y": fromY, "--from-scale": fromScale }) as CSSProperties;

/**
 * S1「街を選ぶ」（SPEC motion §5.1「灯りの地図帳」のトップ）。
 * 夜の舞台に灯りが北から南へともり、「歩く」が跳ねる。右（スマホは下）の紙の札で街を選ぶと、北海道の上で灯りが渡り、
 * 件数が回って跳ねる。主ボタンを押すと、押した所から地図が円で開く（lamp-iris）。
 * 街ごとの実データ（公開ピン数・今週確認された店）はサーバー側で事前にまとめて取得し（`page.tsx`）、
 * 街チップの切り替えは追加の通信なしで即座に切り替える。
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
  const reduced = usePrefersReducedMotion();
  const [selectedSlug, setSelectedSlug] = useState(defaultCitySlug);
  // 街を一度でも替えたか（最初の表示では今週の店の行を入場させない。替えたときだけ貼り替える）
  const [cityChanged, setCityChanged] = useState(false);
  const [isStarting, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Codex R8 重要4・Codex R9 重要4・Codex R10 重要3: 夜の灯りの明滅は5秒を超える自動運動のため、止める手段が必要
  // （WCAG 2.2.2）。既定は prefers-reduced-motion に従い、利用者が明示的に選んだ状態（userChoice）はOS設定の変化で
  // 上書きしない。SSR・マウント直後は "auto"（OS設定は CSS の media query 側で効く）を返し、ハイドレーション不一致を避ける。
  const { motionState, toggleMotion } = useMotionState();
  const trailRef = useDeferredUntilPainted<HTMLDivElement>();
  const motionPaused = motionState === "paused";

  // R13レビュー重要4: 参照データ（街）の投入前・投入失敗時に選択都市が undefined になるのを防ぐ。
  // 街が1件も無い場合は選択・開始のUIを出さず、空状態だけを表示する（§4.6）。
  if (cities.length === 0) {
    return (
      // main ランドマークは AppShell が既に出しているので、ここでは重ねない。
      <div className="start-screen start-empty">
        <div className="start-empty-inner">
          <h1 className="start-empty-title">
            <PageLamp />
            そっとマップ
          </h1>
          <LanternChild size={48} />
          <p className="start-empty-big">まだ街の準備中です</p>
          <p className="start-empty-small">しばらくしてから、もう一度のぞいてみてください。</p>
        </div>
      </div>
    );
  }

  const selectedCity = cities.find((city) => city.slug === selectedSlug) ?? cities[0];
  const selectedData = dataBySlug[selectedCity.slug] ?? { publishedCount: 0, recentlyVerified: [] };

  const selectCity = (slug: string) => {
    if (slug === selectedSlug) return;
    setSelectedSlug(slug);
    setCityChanged(true);
  };

  const startWalking = (event: MouseEvent<HTMLButtonElement>) => {
    // アイリスはこのボタンの位置から開く（遷移を始める前に中心を書く。§4.2.4）
    setIrisOrigin(event.currentTarget);
    setErrorMessage(null);
    const slug = selectedCity.slug;
    startTransition(async () => {
      try {
        await saveHomeCityAction(slug);
        router.push(`/${slug}`, { transitionTypes: ["lamp-iris"] });
      } catch (error) {
        unstable_rethrow(error);
        setErrorMessage("ごめんなさい、街を保存できませんでした。もう一度押してみてください。");
      }
    });
  };

  return (
    <div
      className="start-screen"
      // Codex R9 重要4: CSS側はこの data-motion を prefers-reduced-motion より優先して見る
      // （利用者が「動きを再開する」を押せば、OSがreduceでも灯りを動かせるようにするため）。
      data-motion={motionState}
    >
      <header className="start-header">
        <div className="start-wrap">
          <BrandLockup intro size={null} />
        </div>
      </header>

      <div className="start-wrap">
        {/* 夜の舞台 */}
        <section className="start-hero night-card" aria-labelledby="start-h1">
          {/* 灯りの明滅を止める・再開する（44px以上、控えめな見た目） */}
          <button type="button" aria-pressed={motionPaused} onClick={toggleMotion} className="start-motion-toggle">
            <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
              {motionPaused ? (
                <path d="M3 1.5 L10 6 L3 10.5Z" fill="currentColor" />
              ) : (
                <>
                  <rect x="2.5" y="2" width="2.4" height="8" rx="1" fill="currentColor" />
                  <rect x="7.1" y="2" width="2.4" height="8" rx="1" fill="currentColor" />
                </>
              )}
            </svg>
            {motionPaused ? "動きを再開する" : "動きを止める"}
          </button>

          {/* 飾りの層（奥から: 道の線 → にじむ光 → 灯りの点 → 山並み） */}
          <div aria-hidden="true" className="start-hero-deco">
            <div className="start-par-road">
              <RoadLines />
            </div>
            <div className="start-par-glow">
              <span className="night-glow start-glow-a" />
              <span className="night-glow start-glow-b" />
            </div>
            <LampDots count={16} ignite dotClassName="start-light" />
            <div className="start-par-ridge">
              <NightRidge backdrop="var(--color-neutral-900)" />
            </div>
          </div>

          <div className="start-hero-grid">
            <div className="start-hero-left">
              <div className="start-kicker-row">
                <PageLamp tone="night" />
                <span className="kicker-pill" data-tone="night">
                  北海道・8つの街
                </span>
              </div>
              <h1 id="start-h1" className="start-h1">
                <span className="sr-only">北海道の、まだ静かな店を歩く</span>
                <span className="start-h1-vis" aria-hidden="true">
                  <span className="start-h1-r1 verb-pop" style={pop(0, "0.35em", 1)}>
                    北海道の、
                  </span>
                  <span className="start-h1-r2 verb-pop" style={pop(120, "0.35em", 1)}>
                    まだ
                    <span className="start-quiet">
                      静かな
                      <HandLine
                        variant="underline"
                        draw
                        delay={420}
                        strokeWidth={6}
                        color="var(--color-accent-400)"
                        className="start-quiet-line"
                        style={{ "--dur-draw": "480ms" } as CSSProperties}
                      />
                    </span>
                    店を
                  </span>
                  <span className="start-h1-r3">
                    <span className="start-ch verb-pop" style={pop(260, "0.35em", 0.92)}>
                      歩
                    </span>
                    <span className="start-ch verb-pop" style={pop(320, "0.35em", 0.92)}>
                      く
                    </span>
                  </span>
                </span>
              </h1>
              <p className="start-lead">
                その街に住んでいる人が「ここ、いいよ」って残した店だけ。まだ静かなところから、いっしょに歩いてみませんか。
              </p>
            </div>

            {/* 紙の札（街を選ぶ）: 少し上から置かれて止まる（字は最初から見えている） */}
            <section
              aria-labelledby="start-choose-city"
              className="start-chooser verb-stick keep-visible"
              style={{ "--d": "360ms", "--from-y": "-14px", "--from-rot": "-3deg" } as CSSProperties}
            >
              <div className="start-chooser-head">
                <h2 id="start-choose-city">どの街を歩く？</h2>
                <HokkaidoMap selectedSlug={selectedCity.slug} ignite />
              </div>

              <div role="group" aria-label="街を選ぶ" className="start-chips">
                {cities.map((city, i) => {
                  const active = city.slug === selectedCity.slug;
                  return (
                    // SPEC §9.14-14: 見た目のチップ（36px）を 44px 以上の透明なボタンで包む
                    <button
                      key={city.slug}
                      type="button"
                      aria-pressed={active}
                      onClick={() => selectCity(city.slug)}
                      className="start-city-chip verb-pop keep-visible"
                      style={pop(600 + Math.min(i, 7) * 45, "0px", 0.9)}
                    >
                      <Chip on={active} surface="sand">
                        {city.name}
                      </Chip>
                    </button>
                  );
                })}
              </div>

              <div className="start-dashed" aria-hidden="true" />

              {/* 軽微1: 街を切り替えたときに件数の文章全体を読み上げる（数字の sr-only と二重にならないよう、外側だけに aria-live） */}
              <p className="start-count-p" aria-live="polite" aria-atomic="true">
                <span className="start-count">
                  <span className="start-count-num verb-pop" style={pop(800, "0.25em", 0.88)}>
                    <BounceNumber value={selectedData.publishedCount} />
                  </span>
                  <span className="start-count-unit">軒</span>
                </span>
                <span className="start-count-note">{selectedCity.name}で、地元の人がたしかめて残した店の数です。</span>
              </p>

              <h3 className="start-weekly-h">今週、地元の人がたしかめた店</h3>
              <WeeklyList items={selectedData.recentlyVerified} animate={cityChanged && !reduced} />

              <button
                type="button"
                onClick={startWalking}
                disabled={isStarting}
                className="btn btn-primary btn-lg start-walk"
              >
                {selectedCity.name}を歩いてみる
                <span aria-hidden="true" className="btn-arrow start-nudge">
                  →
                </span>
              </button>
              <p className="start-free">無料。ログインしなくても地図は見られます。</p>
              {errorMessage ? (
                <p role="alert" className="start-error alert-in">
                  {errorMessage}
                </p>
              ) : null}
            </section>
          </div>
        </section>

        {/* 画面の外の節（やくそく・凡例・散歩道）は、最初の描画の後に描く（data-deferred。LCP を守るため） */}
        <div className="start-trail" ref={trailRef} data-deferred="wait">
          {/* やくそく: スクロールで1枚ずつ貼られる */}
          <section className="start-promise" aria-labelledby="start-promise-h">
            {/* 縦の散歩道（PC）: やくそくの灯りから凡例の灯りまで */}
            <span className="start-trail-col" aria-hidden="true" />
            <div className="start-sec-head">
              <div className="start-sec-title">
                <span className="start-trail-lamp" aria-hidden="true" />
                <p className="start-sec-kicker">そっとマップのやくそく</p>
                <h2 id="start-promise-h">静かな店を、静かなままに</h2>
              </div>
              <p className="start-sec-lead">ガイドブックじゃなくて、地元の人のこっそりメモ帳みたいなもの。</p>
            </div>
            <ol className="start-pcards">
              {PROMISES.map((promise, i) => (
                <Reveal key={promise.art} as="li" verb="stick" index={i} delay={i * 75} className="start-pcard">
                  <div className="start-pcard-top" data-tone={promise.tone}>
                    <span className="start-pnum" aria-hidden="true">
                      {i + 1}
                    </span>
                    <PromiseArt kind={promise.art} />
                  </div>
                  <h3>{promise.title}</h3>
                  <p>{promise.body}</p>
                </Reveal>
              ))}
            </ol>
          </section>

          {/* ピンの字の凡例 */}
          <section className="start-legend" aria-labelledby="start-legend-h">
            <div className="start-sec-title">
              <span className="start-trail-lamp" aria-hidden="true" />
              <h2 id="start-legend-h">ピンの字を見てみよう</h2>
            </div>
            <ul className="start-legend-items">
              {LEGEND.map((item, i) => (
                <li key={item.glyph} className="start-legend-item">
                  <Reveal as="span" verb="stamp" delay={i * 120} className="reveal-stamp">
                    <Stamp glyph={item.glyph} tone={item.tone} size={56} tilt={item.tilt} />
                  </Reveal>
                  <div>
                    <p className="start-legend-name">{item.name}</p>
                    <p className="start-legend-note">{item.note}</p>
                  </div>
                </li>
              ))}
            </ul>
            <p className="start-legend-foot">並と観の店は、さがすときに下のほうへ静かに下がります。</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * 今週、地元の人がたしかめた店（§5.1）。街を替えると、前の行ははがれ（160ms）、新しい行が 45ms ずらしで貼られ、
 * 行の灯りの点が行の 120ms 後に灯る。最初の表示では動かさない（紙の札ごと置かれる）。
 */
function WeeklyList({ items, animate }: { items: StartRecentlyVerifiedItem[]; animate: boolean }) {
  return (
    <ul className="start-weekly">
      <AnimatePresence mode="popLayout" initial={false}>
        {items.length === 0 ? (
          <motion.li
            key="empty"
            className="start-weekly-empty"
            initial={animate ? { opacity: 0, y: -8 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ ...PEEL_EXIT, transition: { duration: 0.16, ease: EASE.peel } }}
            transition={{ ...SPRING.settle, delay: 0.08 }}
          >
            今週は、まだだれもたしかめていないみたい。
          </motion.li>
        ) : (
          items.map((item, i) => (
            <motion.li
              key={item.spotId}
              className="start-weekly-row"
              initial={animate ? { opacity: 0, y: -8, rotate: -2 } : false}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ ...PEEL_EXIT, transition: { duration: 0.16, ease: EASE.peel } }}
              transition={{ ...SPRING.settle, delay: 0.08 + Math.min(i, 7) * 0.045, opacity: { duration: 0.12, delay: 0.08 + Math.min(i, 7) * 0.045 } }}
            >
              <span
                className={animate ? "start-weekly-dot verb-ignite" : "start-weekly-dot"}
                style={{ "--d": `${200 + Math.min(i, 7) * 45}ms` } as CSSProperties}
                aria-hidden="true"
              />
              <span className="start-weekly-name">{item.spotName}</span>
              <span className="start-weekly-meta">地元の {item.verifierCount}人がたしかめました</span>
            </motion.li>
          ))
        )}
      </AnimatePresence>
    </ul>
  );
}

/**
 * 画面の外の節を、最初の描画（FCP）の後に描く（SPEC motion §7.1 の /start の予算の記録）。
 * Web フォントが届く前の最初のレイアウトは、日本語の字ごとに書体を探すので重い。画面の外の節まで最初のレイアウトに入れると
 * 最初の表示（LCP）が約 500ms 遅れるため、CSS（`@media (scripting: enabled)` の中）で最初は `content-visibility: hidden` にし、
 * 最初の描画を見届けてから（アイドルの時間に）`data-deferred="done"` にして描く。
 * - JS が無い環境では CSS が効かないので最初から見える。SSR の HTML には中身があるので、読み上げ・検索でも読める。
 * - スクロール・フォーカスが先に来たら、その場で描く。念のため 3 秒でも描く。
 */
function useDeferredUntilPainted<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let observer: PerformanceObserver | undefined;
    let idle: number | undefined;
    const show = () => {
      if (el.dataset.deferred === "done") return;
      el.dataset.deferred = "done";
      cleanup();
    };
    const afterPaint = () => {
      if (typeof window.requestIdleCallback === "function") idle = window.requestIdleCallback(show, { timeout: 600 });
      else window.setTimeout(show, 50);
    };
    const safety = window.setTimeout(show, 3000);
    const onScroll = () => show();
    window.addEventListener("scroll", onScroll, { passive: true, once: true });
    el.addEventListener("focusin", show, { once: true });
    function cleanup() {
      observer?.disconnect();
      if (idle !== undefined && typeof window.cancelIdleCallback === "function") window.cancelIdleCallback(idle);
      window.clearTimeout(safety);
      window.removeEventListener("scroll", onScroll);
      el?.removeEventListener("focusin", show);
    }
    const painted = typeof performance.getEntriesByName === "function" && performance.getEntriesByName("first-contentful-paint").length > 0;
    if (painted) afterPaint();
    else if (typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes?.includes("paint")) {
      observer = new PerformanceObserver(() => {
        observer?.disconnect();
        afterPaint();
      });
      observer.observe({ type: "paint", buffered: true });
    } else {
      show();
    }
    return cleanup;
  }, []);
  return ref;
}

/**
 * 「動きを止める」トグルの実効状態（夜の灯りの明滅にだけ効く。§5.1）。
 * Codex R9 重要4・Codex R10 重要3: OS設定（`prefers-reduced-motion`）と利用者の明示的な選択
 * （userChoice）を別々に持ち、実効状態は「userChoiceがあればそれ、無ければOS設定」で決める。
 * これにより、手動停止後にOS設定が reduce:false へ変わっても停止のまま維持され、
 * 逆にOSが reduce のままでも利用者が「動きを再開する」を押せば動く（WCAG 2.2.2の pause は
 * 利用者が再開を求めるまで再開しない状態のため）。
 * SSR・マウント直後（`matchMedia` をまだ読んでいない間）は "auto"（既定では動くが、OSの
 * prefers-reduced-motion: reduce が CSS の media query で効く。JS無効でも初期描画に反映できる）。
 */
function useMotionState(): {
  motionState: "auto" | "playing" | "paused";
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
  // トグルは利用者に見えている状態（motionState）を反転させる（"auto" は見た目上「動いている」扱い）。
  const toggleMotion = () => {
    setUserChoice(motionState === "paused" ? "playing" : "paused");
  };

  return { motionState, toggleMotion };
}
