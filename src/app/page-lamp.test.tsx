import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NotFound from "./not-found";
import ErrorPage from "./error";
import FaqPage from "./faq/page";
import ShopsPage from "./shops/page";
import TermsPage from "./terms/page";
import PrivacyPage from "./privacy/page";
import LoginPage from "./(auth)/login/page";
import CityLoading from "./[city]/loading";
import { LoadingScreen } from "@/components/ui/LoadingScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/login",
  useSearchParams: () => new URLSearchParams(),
}));

// SPEC motion §4.1.2: 1ページにページの灯り（PageLamp）はちょうど1つ（同じ名前が2つ描かれると、その遷移の演出がまるごと止まる）。
// どのページも PageTransition（[data-page-root]）で包む（§4.2.2。ロード中の画面も包む）。
function expectOneLamp(ui: ReactElement) {
  const { container, unmount } = render(ui);
  expect(container.querySelectorAll(".page-lamp")).toHaveLength(1);
  expect(container.querySelectorAll("[data-page-root]")).toHaveLength(1);
  unmount();
}

describe("描いて確かめられるページ: 灯りはちょうど1つ・PageTransition で包む", () => {
  it.each([
    ["404", () => <NotFound />],
    ["エラー", () => <ErrorPage error={new Error("x")} retry={() => {}} />],
    ["FAQ", () => <FaqPage />],
    ["掲載店舗の方へ", () => <ShopsPage />],
    ["利用規約", () => <TermsPage />],
    ["プライバシーポリシー", () => <PrivacyPage />],
    ["ロード中（共通）", () => <LoadingScreen />],
    ["地図のロード中", () => <CityLoading />],
  ] as const)("%s", (_name, make) => {
    expectOneLamp(make());
  });

  it("ログイン", async () => {
    expectOneLamp(await LoginPage({ searchParams: Promise.resolve({}) }));
  });
});

// データを読むページ（サーバー部品）は、描く部品のソースで数える。分岐の中の灯りはどれか1つだけが描かれる。
describe("データを読むページ: ソースの灯りの数", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");
  const count = (path: string) => (read(path).match(/<PageLamp\b/g) ?? []).length;

  it.each([
    // [ファイル, 灯りの数, 何を描くか]
    ["app/[city]/spots/[id]/page.tsx", 1, "店の詳細の h1"],
    ["app/me/page.tsx", 1, "自分の h1"],
    ["app/bookmarks/page.tsx", 1, "栞の h1（夜）"],
    ["app/contact/page.tsx", 1, "お問い合わせの h1"],
    ["app/verify/[requestId]/page.tsx", 1, "期限前・回答済みの h1（回答フォームのときは VerifyForm 側）"],
    ["components/spot-form/VerifyForm.tsx", 1, "回答フォームの h1"],
    ["components/spot-form/NewSpotForm.tsx", 1, "ピンを立てるの h1"],
    ["components/spot-list/SearchScreen.tsx", 1, "さがすの h1"],
    ["components/legal/LegalPage.tsx", 1, "規約・プライバシーの h1"],
    ["app/start/StartScreen.tsx", 2, "街が0件の h1 と夜の舞台の h1（どちらか一方だけが描かれる）"],
    ["components/map/CityMapScreen.tsx", 2, "PC 用とスマホ用の h1（見えている方だけ morph）"],
  ] as const)("%s は %i つ（%s）", (path, expected, what) => {
    expect(count(path), what).toBe(expected);
  });

  it("地図の画面の2つの灯りは、見えている方だけがページをまたいで渡る（同じ名前を2つ同時に出さない）", () => {
    const source = read("components/map/CityMapScreen.tsx");
    expect(source).toContain("<PageLamp morph={isDesktop} />");
    expect(source).toContain("<PageLamp morph={!isDesktop} />");
  });

  it.each([
    "app/start/page.tsx",
    "app/[city]/page.tsx",
    "app/[city]/search/page.tsx",
    "app/[city]/spots/[id]/page.tsx",
    "app/[city]/spots/new/page.tsx",
    "app/bookmarks/page.tsx",
    "app/me/page.tsx",
    "app/verify/[requestId]/page.tsx",
    "app/contact/page.tsx",
  ])("%s は PageTransition で包む", (path) => {
    expect(read(path)).toContain("<PageTransition>");
  });
});
