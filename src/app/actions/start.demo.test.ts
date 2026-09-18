// SPEC §9.16（デモモード）: デモ利用者（Aさん・札幌在住）がトップで小樽を選んで歩きはじめても、
// 住んでいる街は札幌のまま（小樽にピンを立てたり、小樽の地元として確認したりできない）。
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID } from "@/lib/auth/constants";
import { resetFixtureUserHomeCities } from "@/lib/db/fixtures";
import { getUserProfile } from "@/lib/db/spots";
import { saveHomeCityAction } from "./start";

const SAPPORO_CITY_ID = "a0000000-0000-4000-8000-000000000001";

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

afterEach(() => {
  resetFixtureUserHomeCities();
});

describe("saveHomeCityAction（デモモード）", () => {
  it("別の街を選んでも、設定済みの住んでいる街を上書きしない", async () => {
    await saveHomeCityAction("otaru");

    const profile = await getUserProfile(DEMO_USER_ID);
    expect(profile?.homeCityId).toBe(SAPPORO_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
  });
});
