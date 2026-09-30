"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { unstable_rethrow } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui";
import type { Badge, Quietness, Verification } from "@/lib/db/types";
import { quietnessLabel } from "@/lib/domain/quietness";
import { badgeThreshold } from "@/lib/domain/lantern";
import { formatTokyoYearMonth } from "@/lib/format/date-time";
import { submitVerification } from "@/app/actions/spot-verify";
import { usePrefersReducedMotion } from "@/components/ui/motion-prefs";
import { useLamp } from "@/components/motion/LampLayer";
import { Reveal } from "@/components/motion/Reveal";
import { Stamp } from "@/components/motion/Stamp";
import { EASE } from "@/components/motion/tokens";
import { HandLine } from "@/components/illustrations/HandLine";
import { LampDots } from "@/components/illustrations/LampDots";
import { Lantern } from "@/components/illustrations/Lantern";
import { RoadLines } from "@/components/illustrations/RoadLines";
import { PIN_GLYPH } from "@/components/map/pin-halo";
import { LanternProgress } from "@/app/me/LanternBadge";
import { useShowRewardsSetting } from "./reward-settings";
import { VERIFY_ANSWER_OPTIONS } from "./verify-schema";
import { VerifyHeading, VerifyShopCard } from "./VerifyIntro";

export interface VerifyFormProps {
  requestId: string;
  spotName: string;
  daysSinceLast: number;
  history: Verification[];
  /** 回答前のスポットの状態が dormant だったか。復帰時の「地図に戻りました。」表示に使う。 */
  wasDormant?: boolean;
}

/** SPEC §9.8: 「2025年12月 / 静かなまま」のように年月とラベルを "/" で区切る。 */
function formatHistoryEntry(v: Verification): string {
  return `${formatTokyoYearMonth(v.createdAt)} / ${quietnessLabel(v.answer)}`;
}

/** 受け付けから、+N の灯りが番人の棒へ飛び始めるまで（SPEC motion §5.7）。 */
const KEEPER_FLY_DELAY_MS = 1100;
const KEEPER_FLY_MS = 520;

/**
 * S6「確認」画面のフォーム＋回答後の灯り演出（SPEC motion §5.7）。
 * 答えを押すとその判子の位置を覚え、受け付けられたら判子が店のカードの置き場へ飛んで押される。
 * 演出 ON なら夜のカードで「ありがとう！」・+N が灯って番人の棒へ流れ込み、花丸が描かれる（受け付けから 2.2 秒以内に静まる）。
 */
export function VerifyForm({ requestId, spotName, daysSinceLast, history, wasDormant = false }: VerifyFormProps) {
  const [showRewards, setShowRewards] = useShowRewardsSetting();
  const [answered, setAnswered] = useState<Quietness | null>(null);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [error, setError] = useState<string | null>(null);
  // SPEC §9.14-1: 下層が accepted:false を返す（同じ依頼への二重送信）場合は、
  // 成功演出を出さず「この確認は回答済みです。」に切り替える。
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [returnedToMap, setReturnedToMap] = useState(false);
  const [isPending, startTransition] = useTransition();
  // 店のカードの置き場に押された判子（受け付けられた答え）
  const [slotStamp, setSlotStamp] = useState<Quietness | null>(null);
  const reduced = usePrefersReducedMotion();
  const lamp = useLamp();
  // 押した答えの判子の位置（受け付けられたら、ここから置き場へ飛ぶ）
  const stampRectRef = useRef<DOMRect | null>(null);
  const pointsRef = useRef<HTMLSpanElement | null>(null);
  const [keeperFilled, setKeeperFilled] = useState(false);

  const handleAnswer = (answer: Quietness, event: MouseEvent<HTMLButtonElement>) => {
    if (isPending) return;
    // SPEC motion §7.2-8: 先に判子の位置を測る（送信は待たない）
    const stamp = event.currentTarget.querySelector(".answer-stamp");
    stampRectRef.current = stamp ? stamp.getBoundingClientRect() : null;
    setError(null);
    startTransition(async () => {
      // SPEC §9.14-14: サーバー側の try/catch では捕まえられない通信断
      // （Server Action の Promise 自体が reject する場合）もここで拾い、
      // インラインの role="alert" で知らせる。
      try {
        const result = await submitVerification(requestId, answer);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        if (!result.accepted) {
          setAlreadyAnswered(true);
          return;
        }
        // 受け付けられた: 覚えた位置から置き場へ判子が飛び、着いたら押される（受け付けられる前・エラーでは飛ばさない）
        const from = stampRectRef.current;
        const slot = lamp.target("verify-slot");
        if (from && slot) {
          lamp.fly(from, slot, {
            kind: "stamp",
            glyph: PIN_GLYPH[answer],
            tone: answer,
            onArrive: () => setSlotStamp(answer),
          });
        } else {
          setSlotStamp(answer);
        }
        setAnswered(answer);
        setPointsAwarded(result.pointsAwarded);
        setBadges(result.badges);
        // SPEC §9.14-1: dormant → published の復帰時だけ「地図に戻りました。」を添える。
        setReturnedToMap(wasDormant && result.status === "published");
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        setError("ごめんなさい、うまく記録できませんでした。もう一度押してみてください。");
      }
    });
  };

  const keeperBadge = badges.find((b) => b.slug === "keeper");
  const showKeeper = Boolean(showRewards && keeperBadge && !keeperBadge.earned);

  // +N の灯りが番人の棒の先へ飛び込み、着いたら棒が今の値から新しい値へ満ちる
  useEffect(() => {
    // reduce では飛ばさず、棒は最初から新しい値で出す
    if (!answered || !showKeeper || reduced) return;
    const timer = window.setTimeout(() => {
      const from = pointsRef.current;
      const to = lamp.target("keeper-bar");
      if (from && to) lamp.fly(from, to, { kind: "lamp", duration: KEEPER_FLY_MS, onArrive: () => setKeeperFilled(true) });
      else setKeeperFilled(true);
    }, KEEPER_FLY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [answered, showKeeper, reduced, lamp]);

  const keeperThreshold = badgeThreshold("keeper");
  const keeperRemaining = keeperBadge?.remaining ?? 0;
  const keeperNow = Math.max(0, keeperThreshold - keeperRemaining);
  // 動き始めの値は「今回の1件を数える前」（SPEC motion §10.2-8）
  const keeperBefore = keeperThreshold > 0 ? Math.max(0, (keeperThreshold - keeperRemaining - 1) / keeperThreshold) : 0;
  const keeperAfter = keeperThreshold > 0 ? keeperNow / keeperThreshold : 0;

  const instant = { duration: 0 } as const;

  return (
    <div className="verify">
      <VerifyHeading />

      <VerifyShopCard
        spotName={spotName}
        daysSinceLast={daysSinceLast}
        slot={
          <span className="verify-slot" data-lamp-target="verify-slot" aria-hidden="true">
            {slotStamp ? (
              <Stamp glyph={PIN_GLYPH[slotStamp]} tone={slotStamp} size={56} tilt={-6} animate="press" className="verify-slot-stamp" />
            ) : null}
          </span>
        }
      />

      <AnimatePresence mode="wait" initial={false}>
        {alreadyAnswered ? (
          <motion.div key="already" className="card verify-result verb-stick">
            <div className="card-title">この確認は回答済みです。</div>
          </motion.div>
        ) : answered ? (
          showRewards ? (
            <motion.div key="thanks" className="night-card verify-thanks verb-stick">
              <div className="verify-thanks-deco" aria-hidden="true">
                <RoadLines />
                <span className="night-glow" style={{ width: 300, height: 300, right: -110, top: -120 }} />
                <LampDots count={4} ignite />
              </div>
              <p className="verify-thanks-title">ありがとう！</p>
              <p className="verify-thanks-lead">灯りがひとつ、ともりました。</p>
              <p className="verify-thanks-answer">
                <Stamp glyph={PIN_GLYPH[answered]} tone={answered} size={30} />
                <span>{quietnessLabel(answered)}</span>
              </p>
              <p className="verify-points-row">
                <span className="verify-points-glow verb-ignite-glow" aria-hidden="true" style={{ "--d": "700ms" } as CSSProperties} />
                <span ref={pointsRef} className="verify-points verb-pop" style={{ "--from-scale": "0.6", "--d": "700ms" } as CSSProperties}>
                  +{pointsAwarded}
                </span>
              </p>
              {/* SPEC §9.8: S6 の報酬説明。原本の文言を一字一句そのまま実装する。 */}
              <p className="verify-reward-note">確認を続けた人だけが、次の街を先に見られます。</p>
              {showKeeper && keeperBadge ? (
                <div className="verify-keeper">
                  <p className="verify-keeper-text">
                    灯りの番人まで、あと<span className="verify-keeper-num">{keeperRemaining}</span>件
                  </p>
                  <LanternProgress
                    current={keeperNow}
                    threshold={keeperThreshold}
                    label={`${keeperBadge.label}の進み具合`}
                    p={keeperFilled || reduced ? keeperAfter : keeperBefore}
                    className="verify-keeper-bar"
                    lampTarget="keeper-bar"
                  />
                </div>
              ) : null}
              {returnedToMap ? (
                <p className="verify-returned" role="status" aria-live="polite">
                  地図に戻りました。
                </p>
              ) : null}
              <HandLine variant="hanamaru" draw={!reduced} delay={1300} className="verify-hanamaru" />
            </motion.div>
          ) : (
            <motion.div key="thanks-plain" className="card verify-result verb-stick">
              <div className="card-kicker">ありがとう！</div>
              <div className="card-title">{quietnessLabel(answered)}</div>
              {returnedToMap ? (
                <p className="text-sm m-0" role="status" aria-live="polite">
                  地図に戻りました。
                </p>
              ) : null}
            </motion.div>
          )
        ) : (
          <motion.div
            key="answers"
            className="verify-answers"
            exit={reduced ? { opacity: 0, transition: instant } : { opacity: 0, y: -8, rotate: 1, transition: { duration: 0.16, ease: EASE.peel } }}
          >
            {VERIFY_ANSWER_OPTIONS.map((option, i) => (
              <Button
                key={option.value}
                type="button"
                variant="secondary"
                className="answer"
                aria-disabled={isPending ? "true" : undefined}
                onClick={(event) => handleAnswer(option.value, event)}
              >
                {/* 構える動き（ホバー・フォーカス）は包みに付ける（判子の押す動きの最終値と取り合わないように） */}
                <span className="answer-stamp-hold" aria-hidden="true">
                  <Stamp
                    glyph={PIN_GLYPH[option.value]}
                    tone={option.value}
                    size={48}
                    animate="press"
                    className="answer-stamp"
                    style={{ "--d": `${400 + i * 90}ms` } as CSSProperties}
                  />
                </span>
                <span className="answer-label">{option.label}</span>
              </Button>
            ))}
            <p className="search-pending verify-pending" data-on={isPending ? "true" : "false"}>
              {isPending ? (
                <>
                  <span className="search-pending-lamp" aria-hidden="true" />
                  記録しています…
                </>
              ) : null}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {error ? (
        <p role="alert" className="inline-alert alert-in text-sm">
          <Lantern size={16} tone="paper" />
          {error}
        </p>
      ) : null}

      <section className="verify-history" aria-labelledby="verify-history-heading">
        <h2 id="verify-history-heading" className="verify-history-title">
          これまでの答え
        </h2>
        {history.length === 0 ? (
          <p className="text-muted text-sm">これが最初の確認です。</p>
        ) : (
          <Reveal as="div" verb="draw" className="verify-timeline-wrap">
            <span className="verify-timeline-path" aria-hidden="true" />
            <ul className="verify-timeline">
              {history.map((v, i) => (
                <li key={v.id}>
                  <Reveal as="span" verb="stamp" index={i} className="reveal-stamp verify-timeline-stamp">
                    <Stamp glyph={PIN_GLYPH[v.answer]} tone={v.answer} size={26} />
                  </Reveal>
                  {formatHistoryEntry(v)}
                </li>
              ))}
            </ul>
          </Reveal>
        )}
      </section>

      <label className="verify-setting">
        <input type="checkbox" checked={showRewards} onChange={(event) => setShowRewards(event.target.checked)} />
        回答後の灯り演出（+5 など）を表示する
      </label>
    </div>
  );
}
