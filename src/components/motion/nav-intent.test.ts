import { afterEach, describe, expect, it } from "vitest";
import { markNavigation, settleNavigation } from "./nav-intent";

const root = () => document.documentElement;

describe("型付き遷移の印（html[data-nav]）", () => {
  afterEach(() => {
    delete root().dataset.nav;
    delete root().dataset.navFresh;
  });

  it("遷移で着いたページにいる間は残し、その次にページが変わったら外す", () => {
    markNavigation("page-forward");
    expect(root().dataset.nav).toBe("page-forward");
    settleNavigation(); // 着いたページへ変わった
    expect(root().dataset.nav).toBe("page-forward");
    settleNavigation(); // さらに次のページへ（型なし）
    expect(root().dataset.nav).toBeUndefined();
  });

  it("印が無ければ何もしない", () => {
    settleNavigation();
    expect(root().dataset.nav).toBeUndefined();
  });
});
