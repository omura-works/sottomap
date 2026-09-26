"use client";

import { useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { Button, Card } from "@/components/ui";
import type { Badge, Quietness, Verification } from "@/lib/db/types";
import { quietnessLabel } from "@/lib/domain/quietness";
import { formatTokyoYearMonth } from "@/lib/format/date-time";
import { submitVerification } from "@/app/actions/spot-verify";
import { useShowRewardsSetting } from "./reward-settings";
import { VERIFY_ANSWER_OPTIONS } from "./verify-schema";

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

/** S6「確認」画面のフォーム＋回答後の灯り演出。 */
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

  const handleAnswer = (answer: Quietness) => {
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
        setAnswered(answer);
        setPointsAwarded(result.pointsAwarded);
        setBadges(result.badges);
        // SPEC §9.14-1: dormant → published の復帰時だけ「地図に戻りました。」を添える。
        setReturnedToMap(wasDormant && result.status === "published");
      } catch (error) {
        // 未ログイン時の Server Action redirect は Next.js に処理させる。
        unstable_rethrow(error);
        setError("確認の記録に失敗しました");
      }
    });
  };

  const keeperBadge = badges.find((b) => b.slug === "keeper");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted text-sm">地元の人へ / 90日ごとの確認</p>
        <h1 style={{ fontSize: 30 }}>この店は、まだ隠れていますか</h1>
      </div>

      <Card title={spotName} meta={`前回の確認から${daysSinceLast}日`} />

      {alreadyAnswered ? (
        <Card title="この確認は回答済みです。" />
      ) : answered ? (
        <Card kicker="ありがとうございます" title={quietnessLabel(answered)}>
          {showRewards ? (
            <div className="space-y-1">
              <p className="text-lg font-medium" style={{ color: "var(--color-accent-700)" }}>
                +{pointsAwarded}
              </p>
              {/* SPEC §9.8: S6 の報酬説明。原本の文言を一字一句そのまま実装する。 */}
              <p className="text-sm text-muted m-0">確認を続けた人だけが、次の街を先に見られます。</p>
              {keeperBadge && !keeperBadge.earned ? <p className="text-sm">灯りの番人 あと{keeperBadge.remaining}件</p> : null}
            </div>
          ) : null}
          {returnedToMap ? (
            <p className="text-sm m-0" role="status" aria-live="polite">
              地図に戻りました。
            </p>
          ) : null}
        </Card>
      ) : (
        <div className="space-y-2">
          {VERIFY_ANSWER_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant="secondary"
              block
              disabled={isPending}
              onClick={() => handleAnswer(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-accent-700)" }}>
          {error}
        </p>
      ) : null}

      <div className="space-y-2">
        <h3>これまでの答え</h3>
        {history.length === 0 ? (
          <p className="text-muted text-sm">まだ確認の記録がありません。</p>
        ) : (
          <ul className="space-y-1 text-sm list-none">
            {history.map((v) => (
              <li key={v.id}>{formatHistoryEntry(v)}</li>
            ))}
          </ul>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={showRewards} onChange={(event) => setShowRewards(event.target.checked)} />
        回答後の灯り演出（+5 など）を表示する
      </label>
    </div>
  );
}
