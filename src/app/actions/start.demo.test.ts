// SPEC §9.16（デモモード）: デモ利用者（Aさん・札幌在住）がトップで小樽を選んで歩きはじめても、
// 住んでいる街は札幌のまま（小樽にピンを立てたり、小樽の地元として確認したりできない）。
// 未設定の利用者は初回だけ設定し、2タブから同時に歩きはじめても後続は「変更」として成立しない（R13 重要1）。
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID } from "@/lib/auth/constants";
import { overrideFixtureUserHomeCityForTest, resetFixtureUserHomeCities } from "@/lib/db/fixtures";
import { setUserHomeCity } from "@/lib/db/mutations";
import { getUserProfile } from "@/lib/db/spots";
import { saveHomeCityAction } from "./start";

const SAPPORO_CITY_ID = "a0000000-0000-4000-8000-000000000001";
const OTARU_CITY_ID = "a0000000-0000-4000-8000-000000000002";
const HAKODATE_SLUG = "hakodate";

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

  it("住んでいる街が未設定なら、初回だけ選んだ街を設定する（「街だけ未設定・変更時刻あり」でも時刻は消える）", async () => {
    overrideFixtureUserHomeCityForTest(DEMO_USER_ID, null, "2026-09-01T00:00:00.000Z");

    await saveHomeCityAction("otaru");

    const profile = await getUserProfile(DEMO_USER_ID);
    expect(profile?.homeCityId).toBe(OTARU_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
  });

  it("2タブから同時に別の街で歩きはじめても、先の1つだけが設定され、変更に数えず90日の制限もかからない", async () => {
    overrideFixtureUserHomeCityForTest(DEMO_USER_ID, null, null);

    await Promise.all([saveHomeCityAction("otaru"), saveHomeCityAction(HAKODATE_SLUG)]);

    const profile = await getUserProfile(DEMO_USER_ID);
    expect(profile?.homeCityId).toBe(OTARU_CITY_ID);
    expect(profile?.homeCityChangedAt).toBeNull();
    // /me からの最初の変更は制限を受けない
    await expect(setUserHomeCity(DEMO_USER_ID, SAPPORO_CITY_ID)).resolves.not.toBeNull();
  });
});
