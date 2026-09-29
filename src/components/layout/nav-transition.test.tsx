import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { SideRail } from "./SideRail";

let mockPathname = "/sapporo/search";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

// next/link を、受け取った transitionTypes を属性に写す <a> に置き換える（向きを確かめるため）。
vi.mock("next/link", () => ({
  default: ({ href, transitionTypes, children, ...rest }: { href: string; transitionTypes?: string[]; children: ReactNode }) => (
    <a href={href} data-types={transitionTypes?.join(",") ?? ""} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

// SPEC motion §4.2.1: タブの向きで page-forward / page-back の型を付け、今と同じタブには付けない。
describe.each([
  ["サイドレール", SideRail],
  ["下部タブ", BottomNav],
] as const)("%s のタブの向き", (_name, Nav) => {
  it("さがすにいるとき: 地図は back、栞・自分は forward、さがすは型なし", () => {
    mockPathname = "/sapporo/search";
    render(<Nav />);
    expect(screen.getByRole("link", { name: "地図" })).toHaveAttribute("data-types", "page-back");
    expect(screen.getByRole("link", { name: "栞" })).toHaveAttribute("data-types", "page-forward");
    expect(screen.getByRole("link", { name: "自分" })).toHaveAttribute("data-types", "page-forward");
    expect(screen.getByRole("link", { name: "さがす" })).toHaveAttribute("data-types", "");
  });

  it("タブに当たらないページ（/faq）からはどのタブも forward", () => {
    mockPathname = "/faq";
    render(<Nav />);
    for (const name of ["地図", "さがす", "栞", "自分"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("data-types", "page-forward");
    }
  });
});
