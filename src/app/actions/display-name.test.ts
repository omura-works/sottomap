// SPEC §9.18-1: /me の表示名の変更（デモモード。規則は DB 関数 set_display_name と同じ）。
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DEMO_USER_ID } from "@/lib/auth/constants";
import { resetFixtureUserDisplayNames } from "@/lib/db/fixtures";
import { getUserProfile } from "@/lib/db/spots";
import { changeDisplayNameAction } from "./display-name";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

afterEach(() => {
  resetFixtureUserDisplayNames();
});

describe("changeDisplayNameAction（デモモード）", () => {
  it("前後の空白を除いて保存し、保存した名前を返す", async () => {
    const result = await changeDisplayNameAction("  灯りの人 ");

    expect(result).toEqual({ ok: true, displayName: "灯りの人" });
    expect((await getUserProfile(DEMO_USER_ID))?.displayName).toBe("灯りの人");
  });

  it("メールアドレスの形は拒否し、表示名は変えない", async () => {
    const before = (await getUserProfile(DEMO_USER_ID))?.displayName;

    const result = await changeDisplayNameAction("me@example.com");

    expect(result).toEqual({ ok: false, message: "表示名にメールアドレスは使えません" });
    expect((await getUserProfile(DEMO_USER_ID))?.displayName).toBe(before);
  });

  it("21文字以上・空白だけ・改行は拒否する", async () => {
    expect(await changeDisplayNameAction("あ".repeat(21))).toEqual({
      ok: false,
      message: "表示名は20文字以内で入力してください",
    });
    expect(await changeDisplayNameAction("　")).toEqual({ ok: false, message: "表示名を入力してください" });
    expect(await changeDisplayNameAction("灯り\nの人")).toEqual({
      ok: false,
      message: "表示名に改行や制御文字は使えません",
    });
  });
});
