import { afterEach, describe, expect, it, vi } from "vitest";

// NODE_ENV を書き換えると Vite の jsx dev/prod ランタイム判定まで狂うため、
// isProductionRuntime() 自体をモックして本番判定の分岐だけを確かめる。
describe("StyleguidePage", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/supabase/env");
    vi.resetModules();
  });

  it("本番判定のときは notFound() を呼び 404 になる", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/env", () => ({ isProductionRuntime: () => true }));
    const { default: StyleguidePage } = await import("./page");

    let digest: string | undefined;
    try {
      StyleguidePage();
    } catch (error) {
      digest = (error as { digest?: string }).digest;
    }
    expect(digest).toMatch(/404$/);
  });

  it("本番判定でないときは本体を表示する（例外を投げない）", async () => {
    vi.resetModules();
    vi.doMock("@/lib/supabase/env", () => ({ isProductionRuntime: () => false }));
    const { default: StyleguidePage } = await import("./page");
    expect(() => StyleguidePage()).not.toThrow();
  });
});
