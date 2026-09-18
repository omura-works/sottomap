// SPEC §9.16: トップの「歩きはじめる」は住んでいる街を変えない。未設定（NULL）のログイン利用者だけ初回設定する。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUserId } from "@/lib/auth";
import { setUserHomeCity } from "@/lib/db/mutations";
import { getUserProfile } from "@/lib/db/spots";
import type { UserProfile } from "@/lib/db/types";
import { saveHomeCityAction } from "./start";

vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/lib/db/mutations", () => ({ setUserHomeCity: vi.fn(async () => null) }));
vi.mock("@/lib/db/spots", () => ({
  getCity: vi.fn(async (slug: string) => (slug === "otaru" ? { id: "city-otaru", slug: "otaru", name: "小樽" } : null)),
  getUserProfile: vi.fn(),
}));

function profile(homeCityId: string | null): UserProfile {
  return {
    id: "user-1",
    displayName: "テスト",
    homeCityId,
    homeCityChangedAt: null,
    areaName: null,
    residentYears: null,
    avatarUrl: null,
    lanternPoints: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("saveHomeCityAction（見る街と住んでいる街を分ける）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("住んでいる街が設定済みなら、選んだ街で上書きしない", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");
    vi.mocked(getUserProfile).mockResolvedValue(profile("city-sapporo"));

    await saveHomeCityAction("otaru");

    expect(setUserHomeCity).not.toHaveBeenCalled();
  });

  it("住んでいる街が未設定（NULL）なら、初回だけ選んだ街を設定する", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");
    vi.mocked(getUserProfile).mockResolvedValue(profile(null));

    await saveHomeCityAction("otaru");

    expect(setUserHomeCity).toHaveBeenCalledWith("user-1", "city-otaru");
  });

  it("未ログインなら何もしない", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null);

    await saveHomeCityAction("otaru");

    expect(getUserProfile).not.toHaveBeenCalled();
    expect(setUserHomeCity).not.toHaveBeenCalled();
  });

  it("プロフィール行が無ければ何もしない", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");
    vi.mocked(getUserProfile).mockResolvedValue(null);

    await saveHomeCityAction("otaru");

    expect(setUserHomeCity).not.toHaveBeenCalled();
  });

  it("存在しない街は拒否する", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");

    await expect(saveHomeCityAction("no-such-city")).rejects.toThrow("街の情報が取得できませんでした");
    expect(setUserHomeCity).not.toHaveBeenCalled();
  });
});
