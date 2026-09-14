import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "../supabase/server";
import { getCurrentUserId } from "./index";

vi.mock("../supabase/server", () => ({
  createClient: vi.fn(),
}));

const EXPECTED_DEMO_ID = "b0000000-0000-4000-8000-000000000004";

function configureSupabase(): void {
  vi.stubEnv("URASUPO_DEMO_MODE", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key");
}

describe("getCurrentUserId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("URASUPO_DEMO_MODE=1 のデモモードではデモユーザーIDを返す", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "1");
    expect(await getCurrentUserId()).toBe(EXPECTED_DEMO_ID);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("Spec §9.13.1: anon key が欠けた部分設定ではデモユーザーにならず例外", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    await expect(getCurrentUserId()).rejects.toThrow("一部だけ");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("Spec §9.13.1: デモ未指定・Supabase 未設定ではデモユーザーにならず例外", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "");
    await expect(getCurrentUserId()).rejects.toThrow("URASUPO_DEMO_MODE=1");
  });

  it("Spec §9.13.1: 本番でデモが指定されていたら例外", async () => {
    vi.stubEnv("URASUPO_DEMO_MODE", "1");
    vi.stubEnv("NODE_ENV", "production");
    await expect(getCurrentUserId()).rejects.toThrow("本番環境");
  });

  it("Supabase設定済みで未ログインならnullを返す", async () => {
    configureSupabase();
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);

    expect(await getCurrentUserId()).toBeNull();
  });

  it("Supabase設定済みでログイン済みなら認証ユーザーIDを返す", async () => {
    configureSupabase();
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "authenticated-user-id" } },
          error: null,
        }),
      },
    } as never);

    expect(await getCurrentUserId()).toBe("authenticated-user-id");
  });
});
