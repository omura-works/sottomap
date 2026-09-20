// R14 重要3: CSPレポート受信口のレート制限・重複排除・要約ログの単体テスト。
import { describe, expect, it } from "vitest";
import { checkRateLimit, createCspLimiterState, recordViolation } from "./rate-limit";

describe("checkRateLimit", () => {
  // Codex R16 重要1: 1つの送信元が全体の枠を使い切って、他の送信元の本物の違反を
  // 記録させないようにできてはいけない。
  it("ある送信元が上限まで使っても、別の送信元は受け付ける", () => {
    const state = createCspLimiterState(0);
    for (let i = 0; i < 20; i += 1) checkRateLimit(state, 1000, "1.1.1.1");
    expect(checkRateLimit(state, 1000, "1.1.1.1")).toBe(false);
    expect(checkRateLimit(state, 1000, "2.2.2.2")).toBe(true);
  });

  it("60秒の時間枠で20件までは受理し、21件目以降は拒否する", () => {
    const state = createCspLimiterState(0);
    for (let i = 0; i < 20; i += 1) {
      expect(checkRateLimit(state, 1000, "1.1.1.1")).toBe(true);
    }
    expect(checkRateLimit(state, 1000, "1.1.1.1")).toBe(false);
    expect(checkRateLimit(state, 1000, "1.1.1.1")).toBe(false);
  });

  it("時間枠（60秒）が過ぎたら数え直す", () => {
    const state = createCspLimiterState(0);
    for (let i = 0; i < 20; i += 1) checkRateLimit(state, 1000, "1.1.1.1");
    expect(checkRateLimit(state, 1000, "1.1.1.1")).toBe(false);

    // 60秒経過後は新しい時間枠として再び受理する
    expect(checkRateLimit(state, 61_000, "1.1.1.1")).toBe(true);
  });
});

describe("recordViolation", () => {
  it("初回はログに出す（shouldLog=true）", () => {
    const state = createCspLimiterState(0);
    const decision = recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 1000);
    expect(decision.shouldLog).toBe(true);
  });

  it("重複排除の時間枠（60秒）内の同じ鍵はログに出さず、件数だけ数える", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 1000).shouldLog).toBe(true);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 2000).shouldLog).toBe(false);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 30_000).shouldLog).toBe(false);
  });

  it("重複排除の時間枠を過ぎた同じ鍵は、また最初の1件としてログに出す", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 1000).shouldLog).toBe(true);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 65_000).shouldLog).toBe(true);
  });

  it("異なる鍵はそれぞれ独立して初回はログに出す", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 1000).shouldLog).toBe(true);
    expect(recordViolation(state, { effectiveDirective: "style-src", blockedUriOrigin: "https://other.example" }, 1000).shouldLog).toBe(true);
  });

  it("要約の間隔（60秒）に達すると、内訳を含む要約を構造化した値で返し、集計をリセットする", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 1000).summary).toBeUndefined();
    const decision = recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 61_000);
    // Codex R15 重要2: 文字列連結ではなく、そのまま JSON にできる形で返す。
    expect(decision.summary).toEqual({
      elapsedSeconds: 61,
      total: 2,
      breakdown: [{ effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example", count: 2 }],
    });

    // リセット直後はまだ要約を出さない
    expect(recordViolation(state, { effectiveDirective: "script-src", blockedUriOrigin: "https://evil.example" }, 61_500).summary).toBeUndefined();
  });

  it("重複排除のMapはサイズ上限があり、上限を超えたら最も古いエントリを捨てる", () => {
    const state = createCspLimiterState(0);
    const key = (i: number) => JSON.stringify([`script-src-${i}`, "https://evil.example"]);
    for (let i = 0; i < 500; i += 1) {
      recordViolation(state, { effectiveDirective: `script-src-${i}`, blockedUriOrigin: "https://evil.example" }, 1000);
    }
    expect(state.dedupe.size).toBe(500);
    expect(state.dedupe.has(key(0))).toBe(true);

    // 501件目を入れると、上限を超えないよう最も古いものが捨てられる
    recordViolation(state, { effectiveDirective: "script-src-500", blockedUriOrigin: "https://evil.example" }, 1000);
    expect(state.dedupe.size).toBe(500);
    expect(state.dedupe.has(key(0))).toBe(false);
    expect(state.dedupe.has(key(500))).toBe(true);
  });

  // Codex R16 重要2: 値に区切り文字が入っても、別の組と同じ鍵にならない。
  it("directive や origin に「|」が入っても、別の違反として扱う", () => {
    const state = createCspLimiterState(0);
    expect(recordViolation(state, { effectiveDirective: "a|b", blockedUriOrigin: "c" }, 1000).shouldLog).toBe(true);
    expect(recordViolation(state, { effectiveDirective: "a", blockedUriOrigin: "b|c" }, 1000).shouldLog).toBe(true);
  });
});
