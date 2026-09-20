// R14 重要3: CSPレポート受信口のレート制限・重複排除・要約ログの単体テスト。
import { describe, expect, it } from "vitest";
import { checkRateLimit, createCspLimiterState, recordViolation } from "./rate-limit";

describe("checkRateLimit", () => {
  it("60秒の時間枠で20件までは受理し、21件目以降は拒否する", () => {
    const state = createCspLimiterState(0);
    for (let i = 0; i < 20; i += 1) {
      expect(checkRateLimit(state, 1000)).toBe(true);
    }
    expect(checkRateLimit(state, 1000)).toBe(false);
    expect(checkRateLimit(state, 1000)).toBe(false);
  });

  it("時間枠（60秒）が過ぎたら数え直す", () => {
    const state = createCspLimiterState(0);
    for (let i = 0; i < 20; i += 1) checkRateLimit(state, 1000);
    expect(checkRateLimit(state, 1000)).toBe(false);

    // 60秒経過後は新しい時間枠として再び受理する
    expect(checkRateLimit(state, 61_000)).toBe(true);
  });
});

describe("recordViolation", () => {
  it("初回はログに出す（shouldLog=true）", () => {
    const state = createCspLimiterState(0);
    const decision = recordViolation(state, "script-src|https://evil.example", 1000);
    expect(decision.shouldLog).toBe(true);
  });

  it("重複排除の時間枠（60秒）内の同じ鍵はログに出さず、件数だけ数える", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, "script-src|https://evil.example", 1000).shouldLog).toBe(true);
    expect(recordViolation(state, "script-src|https://evil.example", 2000).shouldLog).toBe(false);
    expect(recordViolation(state, "script-src|https://evil.example", 30_000).shouldLog).toBe(false);
  });

  it("重複排除の時間枠を過ぎた同じ鍵は、また最初の1件としてログに出す", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, "script-src|https://evil.example", 1000).shouldLog).toBe(true);
    expect(recordViolation(state, "script-src|https://evil.example", 65_000).shouldLog).toBe(true);
  });

  it("異なる鍵はそれぞれ独立して初回はログに出す", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, "script-src|https://evil.example", 1000).shouldLog).toBe(true);
    expect(recordViolation(state, "style-src|https://other.example", 1000).shouldLog).toBe(true);
  });

  it("要約の間隔（60秒）に達すると、内訳を含む要約行を返し、集計をリセットする", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, "script-src|https://evil.example", 1000).summaryLine).toBeUndefined();
    const decision = recordViolation(state, "script-src|https://evil.example", 61_000);
    expect(decision.summaryLine).toContain("件");
    expect(decision.summaryLine).toContain("script-src|https://evil.example");

    // リセット直後はまだ要約を出さない
    expect(recordViolation(state, "script-src|https://evil.example", 61_500).summaryLine).toBeUndefined();
  });

  it("重複排除のMapはサイズ上限があり、上限を超えたら最も古いエントリを捨てる", () => {
    const state = createCspLimiterState(0);
    for (let i = 0; i < 500; i += 1) {
      recordViolation(state, `key-${i}`, 1000);
    }
    expect(state.dedupe.size).toBe(500);
    expect(state.dedupe.has("key-0")).toBe(true);

    // 501件目を入れると、上限を超えないよう最も古い key-0 が捨てられる
    recordViolation(state, "key-500", 1000);
    expect(state.dedupe.size).toBe(500);
    expect(state.dedupe.has("key-0")).toBe(false);
    expect(state.dedupe.has("key-500")).toBe(true);
  });
});
