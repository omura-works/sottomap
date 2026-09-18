// SPEC §9.16: トップの「歩きはじめる」は住んでいる街を変えない。未設定（NULL）のログイン利用者だけ初回設定する。
// 「未設定か」は読んで判断せず、初回設定専用の initialize_home_city（行ロックの中で判断する）だけに任せる（R13 重要1）。
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUserId } from "@/lib/auth";
import { initializeUserHomeCity, setUserHomeCity } from "@/lib/db/mutations";
import { getUserProfile } from "@/lib/db/spots";
import { saveHomeCityAction } from "./start";

vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/lib/db/mutations", () => ({
  initializeUserHomeCity: vi.fn(async () => true),
  setUserHomeCity: vi.fn(async () => null),
}));
vi.mock("@/lib/db/spots", () => ({
  getCity: vi.fn(async (slug: string) => (slug === "otaru" ? { id: "city-otaru", slug: "otaru", name: "小樽" } : null)),
  getUserProfile: vi.fn(),
}));

describe("saveHomeCityAction（見る街と住んでいる街を分ける）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("初回設定専用の initializeUserHomeCity だけを呼び、変更用の setUserHomeCity は呼ばない", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");

    await saveHomeCityAction("otaru");

    expect(initializeUserHomeCity).toHaveBeenCalledTimes(1);
    expect(initializeUserHomeCity).toHaveBeenCalledWith("user-1", "city-otaru");
    expect(setUserHomeCity).not.toHaveBeenCalled();
  });

  it("「未設定か」を先に読んで判断しない（プロフィールを読まない）", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");

    await saveHomeCityAction("otaru");

    expect(getUserProfile).not.toHaveBeenCalled();
  });

  it("設定済みで何もしなかった（false）ときも例外にしない", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");
    vi.mocked(initializeUserHomeCity).mockResolvedValueOnce(false);

    await expect(saveHomeCityAction("otaru")).resolves.toBeUndefined();
    expect(setUserHomeCity).not.toHaveBeenCalled();
  });

  it("未ログインなら何もしない", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue(null);

    await saveHomeCityAction("otaru");

    expect(initializeUserHomeCity).not.toHaveBeenCalled();
    expect(setUserHomeCity).not.toHaveBeenCalled();
  });

  it("存在しない街は拒否する", async () => {
    vi.mocked(getCurrentUserId).mockResolvedValue("user-1");

    await expect(saveHomeCityAction("no-such-city")).rejects.toThrow("街の情報が取得できませんでした");
    expect(initializeUserHomeCity).not.toHaveBeenCalled();
    expect(setUserHomeCity).not.toHaveBeenCalled();
  });
});
