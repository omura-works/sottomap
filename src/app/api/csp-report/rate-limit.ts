// CSP 違反レポート受信口の濫用対策（R14 重要3）。
//
// `/api/csp-report` は認証不要（ブラウザが送るため）のまま、大量送信によるログ費用増加・
// テレメトリ汚染を防ぐため、同一プロセス内のメモリ状態で次を行う。
//   - レート制限: 60秒あたり最大20件。超えたら以降は本文を読まずに204で終える（呼び出し側の責務）。
//   - 重複排除: effective-directive と blocked-uri のオリジンの組を鍵に、一定時間内の同じ違反は
//     ログに出さず件数だけ数える。
//   - 要約ログ: 一定間隔で「直近◯秒でN件、内訳」を1行ログに出せるよう、要約が必要になったタイミングを返す。
//   - メモリは上限付き（Map のサイズ上限、古いものから捨てる）。
//
// この状態は関数実行環境（プロセス）ごとに独立するインメモリの Map であり、Vercel の
// サーバーレス環境では呼び出しごとに別インスタンスに割り当てられることがあるため、
// 実際の制限は「インスタンス単位」にしかならない（複数インスタンスに分散されると、合計では
// この上限を超えることがある）。厳密な分散レート制限が必要な場合は Vercel Firewall（WAF）等、
// プロセス外の仕組みを使うこと（docs/DEPLOY.md 8節）。

/** レート制限の時間枠（ミリ秒）。 */
const RATE_LIMIT_WINDOW_MS = 60_000;
/**
 * 時間枠あたりの最大受理件数（送信元ごと）。
 * Codex R16 重要1: 全体で1つの枠にすると、攻撃者が最初の20件で枠を使い切り、
 * 他の利用者の本物の違反レポートを記録させないようにできる。送信元ごとに数える。
 */
const RATE_LIMIT_MAX_PER_SOURCE = 20;
/** 時間枠あたりの最大受理件数（全体の歯止め。送信元が多数に分散した場合の上限）。 */
const RATE_LIMIT_MAX_TOTAL = 500;
/** 送信元ごとの計数を保持する Map の最大エントリ数（古いものから捨てる）。 */
const MAX_SOURCE_ENTRIES = 1_000;
/** 重複排除の時間枠（ミリ秒）。この間は同じ鍵の違反をログに出さず件数だけ数える。 */
const DEDUPE_WINDOW_MS = 60_000;
/** 要約ログを出す間隔（ミリ秒）。 */
const SUMMARY_INTERVAL_MS = 60_000;
/** 重複排除用 Map の最大エントリ数（古いものから捨てる）。 */
const MAX_DEDUPE_ENTRIES = 500;

interface DedupeEntry {
  /** この時間枠内で観測した件数（ログに出した1件を含む）。 */
  count: number;
  /** 直近にログへ出した（＝この時間枠を開始した）時刻。 */
  loggedAt: number;
}

/** レート制限・重複排除・要約の状態。プロセス内の1つのインスタンスで共有する。 */
export interface CspLimiterState {
  rateWindowStart: number;
  /** この時間枠で受け取った全体の件数。 */
  rateCount: number;
  /** 送信元ごとの件数（この時間枠内）。 */
  rateBySource: Map<string, number>;
  dedupe: Map<string, DedupeEntry>;
  summaryWindowStart: number;
  summaryBreakdown: Map<string, number>;
}

/** 初期状態を作る（`now` は `Date.now()` を渡す）。 */
export function createCspLimiterState(now: number): CspLimiterState {
  return {
    rateWindowStart: now,
    rateCount: 0,
    rateBySource: new Map(),
    dedupe: new Map(),
    summaryWindowStart: now,
    summaryBreakdown: new Map(),
  };
}

/**
 * レート制限を確認し、状態を更新する（呼ぶたびに1件消費する）。
 * 60秒の固定時間枠で、送信元ごと（20件）と全体（500件）の両方を数え、時間枠が変わったら数え直す。
 * @param source 送信元の識別子（`x-forwarded-for` の先頭など。取れなければ "unknown"）。
 * @returns 受理してよければ true、上限を超えていれば false（本文を読まずに204で終えること）。
 */
export function checkRateLimit(state: CspLimiterState, now: number, source: string): boolean {
  if (now - state.rateWindowStart >= RATE_LIMIT_WINDOW_MS) {
    state.rateWindowStart = now;
    state.rateCount = 0;
    state.rateBySource = new Map();
  }
  state.rateCount += 1;
  const perSource = (state.rateBySource.get(source) ?? 0) + 1;
  if (state.rateBySource.size >= MAX_SOURCE_ENTRIES && !state.rateBySource.has(source)) {
    const oldest = state.rateBySource.keys().next().value;
    if (oldest !== undefined) state.rateBySource.delete(oldest);
  }
  state.rateBySource.set(source, perSource);
  return perSource <= RATE_LIMIT_MAX_PER_SOURCE && state.rateCount <= RATE_LIMIT_MAX_TOTAL;
}

/** 一定間隔でまとめて出す要約（ログには JSON.stringify して出す）。 */
export interface ViolationSummary {
  /** 直近の集計期間（秒）。 */
  elapsedSeconds: number;
  /** 期間内に受け取った違反の合計件数。 */
  total: number;
  /**
   * 内訳。Codex R16 重要2: directive と origin を区切り文字で1本の文字列にすると、
   * 値に区切り文字を含めて別の組と同じ鍵に見せられるため、分けたまま保持する。
   */
  breakdown: { effectiveDirective: string; blockedUriOrigin: string; count: number }[];
}

export interface ViolationDecision {
  /** この違反を（初回として）ログに出すべきか。 */
  shouldLog: boolean;
  /** 要約を出す間隔に達していれば、1行ログにする文字列。達していなければ undefined。 */
  summary?: ViolationSummary;
}

/** Map のサイズが上限に達していたら、最初に挿入された（最も古い）エントリを1つ捨てる。 */
function evictOldestIfFull(dedupe: Map<string, DedupeEntry>): void {
  if (dedupe.size < MAX_DEDUPE_ENTRIES) return;
  const oldestKey = dedupe.keys().next().value;
  if (oldestKey !== undefined) dedupe.delete(oldestKey);
}

/**
 * 1件の違反（`key` = effective-directive と blocked-uri のオリジンの組）を記録する。
 * 同じ鍵が重複排除の時間枠（60秒）内に既にログ済みなら、件数だけ増やしログには出さない。
 * 時間枠を過ぎていれば新しい時間枠として1件目をログに出す。
 * 要約ログの間隔（60秒）に達していたら、その時点までの内訳をまとめた1行を返し、要約の集計をリセットする。
 */
export function recordViolation(
  state: CspLimiterState,
  violation: { effectiveDirective: string; blockedUriOrigin: string },
  now: number,
): ViolationDecision {
  // Codex R16 重要2: 鍵は JSON 化した配列にする（値に区切り文字が入っても別の組と衝突しない）。
  const key = JSON.stringify([violation.effectiveDirective, violation.blockedUriOrigin]);
  const existing = state.dedupe.get(key);
  let shouldLog: boolean;
  if (existing && now - existing.loggedAt < DEDUPE_WINDOW_MS) {
    existing.count += 1;
    shouldLog = false;
  } else {
    evictOldestIfFull(state.dedupe);
    state.dedupe.set(key, { count: 1, loggedAt: now });
    shouldLog = true;
  }

  state.summaryBreakdown.set(key, (state.summaryBreakdown.get(key) ?? 0) + 1);

  // Codex R15 重要2: 要約も文字列組み立てにせず、構造化した値として返す
  // （キーは送信者が決められるため、区切り文字で連結するとログを誤読させられる）。
  let summary: ViolationSummary | undefined;
  if (now - state.summaryWindowStart >= SUMMARY_INTERVAL_MS) {
    const elapsedSeconds = Math.round((now - state.summaryWindowStart) / 1000);
    const total = [...state.summaryBreakdown.values()].reduce((sum, n) => sum + n, 0);
    summary = {
      elapsedSeconds,
      total,
      breakdown: [...state.summaryBreakdown.entries()].map(([entryKey, count]) => {
        const [effectiveDirective, blockedUriOrigin] = JSON.parse(entryKey) as [string, string];
        return { effectiveDirective, blockedUriOrigin, count };
      }),
    };
    state.summaryWindowStart = now;
    state.summaryBreakdown = new Map();
  }

  return { shouldLog, summary };
}
