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

// jsdom は <dialog> の showModal() / close() を実装しないため、テスト用の最小ポリフィルを置く（R13 重要2）。
// 実ブラウザの「背景を操作不可にする」「Esc で cancel」は再現しない（それらは Playwright で検証する）。
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute("open")) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
}
