import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { resetNavLampMemory } from "./NavTab";
import { mockReducedMotion } from "@/components/motion/test-utils";

let mockPathname = "/sapporo";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

// SPEC motion §4.1.1（P7）: ナビの灯りは motion の layoutId ではなく、前の位置から translate で渡る（WAAPI）。
describe("ナビの灯り（WAAPI）", () => {
  const animate = vi.fn(() => ({ finished: Promise.resolve(), cancel: () => {} }) as unknown as Animation);
  const originalAnimate = Element.prototype.animate;
  const originalRect = Element.prototype.getBoundingClientRect;

  afterEach(() => {
    Element.prototype.animate = originalAnimate;
    Element.prototype.getBoundingClientRect = originalRect;
    animate.mockClear();
    resetNavLampMemory();
  });

  function layout() {
    Element.prototype.animate = animate as unknown as typeof Element.prototype.animate;
    // 灯りの位置: どのタブの中にあるかで x を変える（地図 0・さがす 100・栞 200・自分 300）
    Element.prototype.getBoundingClientRect = function (this: Element) {
      if (this.tagName === "NAV") return new DOMRect(0, 500, 400, 64);
      if (this.classList.contains("nav-lamp")) {
        const label = this.closest("a")?.textContent ?? "";
        const x = ["地図", "さがす", "栞", "自分"].findIndex((name) => label.includes(name)) * 100;
        return new DOMRect(x, 510, 6, 6);
      }
      return new DOMRect(0, 0, 10, 10);
    };
  }

  it("最初の表示では渡らない。タブを移ると、前のタブの位置から translate で渡る", () => {
    const spy = mockReducedMotion(false);
    layout();
    mockPathname = "/sapporo";
    const { rerender } = render(<BottomNav />);
    expect(animate).not.toHaveBeenCalled();

    mockPathname = "/sapporo/search";
    rerender(<BottomNav />);
    const call = animate.mock.calls.find((args: unknown[]) => JSON.stringify(args[0]).includes("-100px"));
    expect(call).toBeDefined();
    expect((call as unknown as [Keyframe[], KeyframeAnimationOptions])[0]).toEqual([{ translate: "-100px 0px" }, { translate: "0 0" }]);
    spy.mockRestore();
  });

  it("動きを減らす設定では渡らない", () => {
    layout();
    const spy = mockReducedMotion(true);
    mockPathname = "/sapporo";
    const { rerender } = render(<BottomNav />);
    mockPathname = "/bookmarks";
    rerender(<BottomNav />);
    expect(animate).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
