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

describe("resolveQuietness（Spec §9.2: 最後に受理された確認の回答。多数決は行わない）", () => {
  it("履歴が空なら fallback を返す（既定 quiet）", () => {
    expect(resolveQuietness([])).toBe("quiet");
  });

  it("履歴が空なら明示した fallback を返す", () => {
    expect(resolveQuietness([], "touristy")).toBe("touristy");
  });

  it("最新の回答を採る（配列の並び順に関係なく createdAt で判定する）", () => {
    const verifications = [
      verification({ id: "v1", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v2", answer: "quiet", createdAt: "2026-01-02T00:00:00.000Z" }),
      verification({ id: "v3", answer: "crowding", createdAt: "2026-01-03T00:00:00.000Z" }),
    ];
    expect(resolveQuietness(verifications)).toBe("crowding");
  });

  it("旧仕様の『同数タイ』は無関係。件数に関わらず最新1件のみで決まる", () => {
    // quiet が3件、touristy が1件でも、touristy が一番新しければ touristy。
    const verifications = [
      verification({ id: "v1", answer: "quiet", createdAt: "2025-05-01T00:00:00.000Z" }),
      verification({ id: "v2", answer: "quiet", createdAt: "2025-08-01T00:00:00.000Z" }),
      verification({ id: "v3", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v4", answer: "touristy", createdAt: "2026-01-05T00:00:00.000Z" }),
    ];
    expect(resolveQuietness(verifications)).toBe("touristy");
  });

  it("配列が createdAt 降順で渡されても最新（＝先頭）を正しく採る", () => {
    const verifications = [
      verification({ id: "v2", answer: "quiet", createdAt: "2026-01-05T00:00:00.000Z" }),
      verification({ id: "v1", answer: "touristy", createdAt: "2025-05-01T00:00:00.000Z" }),
    ];
    expect(resolveQuietness(verifications)).toBe("quiet");
  });

  it("同時刻の相反する回答は、入力順に関係なく混雑側（crowding）を採る", () => {
    const quiet = verification({ id: "v1", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" });
    const crowding = verification({ id: "v2", answer: "crowding", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(resolveQuietness([quiet, crowding])).toBe("crowding");
    expect(resolveQuietness([crowding, quiet])).toBe("crowding");
  });

  it("同時刻の3種は、入力順に関係なく touristy を採る", () => {
    const items = [
      verification({ id: "v3", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v1", answer: "touristy", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v2", answer: "crowding", createdAt: "2026-01-01T00:00:00.000Z" }),
    ];
    const permutations = [
      [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
    ].map((order) => order.map((i) => items[i]));
    for (const list of permutations) {
      expect(resolveQuietness(list)).toBe("touristy");
    }
  });

  it("同時刻で回答も同じなら id の大きい方（結果の回答は同じ）", () => {
    const a = verification({ id: "v1", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" });
    const b = verification({ id: "v2", answer: "quiet", createdAt: "2026-01-01T00:00:00.000Z" });
    expect(resolveQuietness([a, b])).toBe("quiet");
    expect(resolveQuietness([b, a])).toBe("quiet");
  });

  it("新しい方が quiet なら、それより古い混雑回答より優先する（タイ規則は同時刻のときだけ）", () => {
    const list = [
      verification({ id: "v9", answer: "touristy", createdAt: "2026-01-01T00:00:00.000Z" }),
      verification({ id: "v1", answer: "quiet", createdAt: "2026-01-01T00:00:00.001Z" }),
    ];
    expect(resolveQuietness(list)).toBe("quiet");
    expect(resolveQuietness([...list].reverse())).toBe("quiet");
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
