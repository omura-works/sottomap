import "@testing-library/jest-dom/vitest";

// jsdom は matchMedia を実装しないため、Rare UI（AnimatedCounter/ConfirmRemoveButton）の
// useReducedMotion() がテスト環境で常に「アニメーションなし」を返すようにする。
// これにより motion のアニメーション完了待ちが不要になり、テストが同期的に検証できる。
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as MediaQueryList;
}
