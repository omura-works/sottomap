import { vi } from "vitest";

/**
 * テスト用: `prefers-reduced-motion` の答えを決める。vitest.setup.ts の既定（jsdom 用の代わり）は
 * 「減らす」を返すので、動きを確かめるテストでは false にする。
 */
export function mockReducedMotion(reduce: boolean) {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: query.includes("prefers-reduced-motion") ? reduce : false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}
