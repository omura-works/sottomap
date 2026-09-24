// @vitest-environment node
// SPEC §9.18-1: ログイン時のプロフィール作成で、メールアドレスの一部を表示名に使わない。
// プロフィール行は DB 関数 ensure_user_profile（初期値「地元の人」）だけが作る。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const getUser = vi.fn();
const rpc = vi.fn();
const from = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession, getUser },
    rpc,
    from,
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  isDemoMode: () => false,
}));

vi.mock("@/lib/auth/site-url", () => ({
  getSiteOrigin: () => "https://urasupo.example",
}));

import { GET } from "./route";

beforeEach(() => {
  exchangeCodeForSession.mockResolvedValue({ error: null });
  getUser.mockResolvedValue({
    data: {
      user: {
        id: "c0000000-0000-4000-8000-000000000001",
        email: "hanako.yamada@example.com",
        user_metadata: { display_name: "hanako.yamada" },
      },
    },
    error: null,
  });
  rpc.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

function callback(next = "/me"): Request {
  return new Request(`https://urasupo.example/auth/callback?code=abc&next=${encodeURIComponent(next)}`);
}

describe("GET /auth/callback", () => {
  it("プロフィール行は ensure_user_profile で作り、メールアドレスの一部を送らない", async () => {
    const response = await GET(callback());

    expect(response.headers.get("location")).toBe("https://urasupo.example/me");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("ensure_user_profile");
    // users への直接の書き込み（表示名の指定）はしない。
    expect(from).not.toHaveBeenCalled();
    const sent = JSON.stringify([rpc.mock.calls, from.mock.calls]);
    expect(sent).not.toContain("hanako");
  });

  it("プロフィール行の作成に失敗したら /login?error=profile へ戻す", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });

    const response = await GET(callback());

    expect(response.headers.get("location")).toBe("https://urasupo.example/login?error=profile");
  });
});
