import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StartScreen } from "./StartScreen";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));

vi.mock("@/app/actions/start", () => ({
  saveHomeCityAction: vi.fn(async () => undefined),
}));

const CITIES = [
  { slug: "sapporo", name: "札幌" },
  { slug: "otaru", name: "小樽" },
];

const DATA = {
  sapporo: {
    publishedCount: 5,
    recentlyVerified: [{ spotId: "s1", spotName: "札幌ザンギ本舗", verifierCount: 5 }],
  },
  otaru: { publishedCount: 3, recentlyVerified: [] },
};

describe("StartScreen（SPEC §9.15 案B）", () => {
  it("h1 はキャッチコピーで、街の選択と主ボタンがある", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    expect(screen.getByRole("heading", { level: 1, name: "北海道の、まだ静かな店を歩く" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "どの街を歩きますか" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "歩きはじめる" })).toBeInTheDocument();
    // §9.15: 「歩きかたを選ぶ（昼／夜／朝）」は置かない
    expect(screen.queryByText("歩きかたを選ぶ")).not.toBeInTheDocument();
  });

  it("街を切り替えると、件数と今週確認された店が切り替わる", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    expect(screen.getByRole("button", { name: "札幌" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("札幌には、地元が確認したピンが")).toBeInTheDocument();
    expect(screen.getByText("札幌ザンギ本舗")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "小樽" }));

    expect(screen.getByRole("button", { name: "小樽" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("小樽には、地元が確認したピンが")).toBeInTheDocument();
    expect(screen.getByText("今週はまだ確認がありません。")).toBeInTheDocument();
  });

  it("§1 の思想を3つの手順として示す", () => {
    render(<StartScreen cities={CITIES} dataBySlug={DATA} defaultCitySlug="sapporo" />);

    expect(screen.getByRole("heading", { level: 2, name: "静けさは、こうして保たれます" })).toBeInTheDocument();
    expect(screen.getByText("同じ街の2人が『行ったことがある』と答えると、地図に出ます")).toBeInTheDocument();
    expect(screen.getByText("90日ごとに、あなたに一度だけ確認が届きます")).toBeInTheDocument();
  });
});
