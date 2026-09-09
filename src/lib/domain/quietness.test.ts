import { describe, expect, it } from "vitest";
import { quietnessLabel, resolveQuietness } from "./quietness";
import type { Verification } from "../db/types";

function verification(overrides: Partial<Verification>): Verification {
  return {
    id: overrides.id ?? "v1",
    spotId: "spot-1",
    userId: "user-1",
    answer: "quiet",
    note: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveQuietness", () => {
  it("履歴が空なら fallback を返す（既定 quiet）", () => {
    expect(resolveQuietness([])).toBe("quiet");
  });

  it("履歴が空なら明示した fallback を返す", () => {
    expect(resolveQuietness([], "touristy")).toBe("touristy");
  });

  it("多数決で決まる", () => {
    const verifications = [
      verification({ id: "v1", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v2", answer: "quiet", createdAt: "2026-01-02T00:00:00.000Z" }),
      verification({ id: "v3", answer: "crowding", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];
    expect(resolveQuietness(verifications)).toBe("quiet");
  });

  it("同数タイなら新しい方の回答を採る（鱗友朝市の例: quiet×2, touristy×2）", () => {
    const verifications = [
      verification({ id: "v1", answer: "quiet", createdAt: "2025-05-01T00:00:00.000Z" }),
      verification({ id: "v2", answer: "quiet", createdAt: "2025-08-01T00:00:00.000Z" }),
      verification({ id: "v3", answer: "touristy", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v4", answer: "touristy", createdAt: "2026-01-05T00:00:00.000Z" }),
    ];
    expect(resolveQuietness(verifications)).toBe("touristy");
  });

  it("同数タイで最新が quiet なら quiet を採る", () => {
    const verifications = [
      verification({ id: "v1", answer: "touristy", createdAt: "2025-05-01T00:00:00.000Z" }),
      verification({ id: "v2", answer: "quiet", createdAt: "2026-01-05T00:00:00.000Z" }),
    ];
    expect(resolveQuietness(verifications)).toBe("quiet");
  });
});

describe("quietnessLabel", () => {
  it("quiet → 静かなまま", () => {
    expect(quietnessLabel("quiet")).toBe("静かなまま");
  });
  it("crowding → 並びはじめた", () => {
    expect(quietnessLabel("crowding")).toBe("並びはじめた");
  });
  it("touristy → もう観光地になった", () => {
    expect(quietnessLabel("touristy")).toBe("もう観光地になった");
  });
});
