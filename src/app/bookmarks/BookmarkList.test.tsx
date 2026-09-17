import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { BookmarkList } from "./BookmarkList";
import type { BookmarkListItem } from "./BookmarkList";
import { removeBookmarkAction } from "@/app/actions/bookmark-actions";

vi.mock("@/app/actions/bookmark-actions", () => ({
  removeBookmarkAction: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(removeBookmarkAction).mockReset();
});

const ITEMS = [
  {
    id: "bookmark-1",
    spotId: "spot-1",
    citySlug: "sapporo",
    cityName: "札幌",
    areaName: "北24条",
    spotName: "シハチ鮮魚店 北24条店",
    photoUrl: null,
    plannedAt: null,
    meta: "札幌・北24条 / 明日 12:30",
  },
  {
    id: "bookmark-2",
    spotId: "spot-2",
    citySlug: "otaru",
    cityName: "小樽",
    areaName: "花園",
    spotName: "聖徳太子 飛鳥店",
    photoUrl: null,
    plannedAt: null,
    meta: "小樽駅から徒歩10分 / 日替わり定食",
  },
  {
    id: "bookmark-3",
    spotId: "spot-3",
    citySlug: "otaru",
    cityName: "小樽",
    areaName: "新富町",
    spotName: "南樽市場",
    photoUrl: null,
    plannedAt: null,
    meta: "小樽 / 地元が買いに行く市場",
  },
  {
    id: "bookmark-4",
    spotId: "spot-4",
    citySlug: "otaru",
    cityName: "小樽",
    areaName: "色内",
    spotName: "鱗友朝市",
    photoUrl: null,
    plannedAt: null,
    meta: "小樽 / 朝のうちに",
  },
] satisfies Array<BookmarkListItem & { meta: string }>;

describe("BookmarkList", () => {
  it("栞ごとの固有メタ文言をデータから表示する", () => {
    render(<BookmarkList initialItems={ITEMS} />);

    expect(screen.getByText("札幌・北24条 / 明日 12:30")).toBeInTheDocument();
    expect(screen.getByText("小樽駅から徒歩10分 / 日替わり定食")).toBeInTheDocument();
    expect(screen.getByText("小樽 / 地元が買いに行く市場")).toBeInTheDocument();
    expect(screen.getByText("小樽 / 朝のうちに")).toBeInTheDocument();
  });

  it("SPEC §9.14-4: 複数都市にまたがる栞は街ごとにボタンを分け、表示件数と渡す件数を一致させる", () => {
    render(<BookmarkList initialItems={ITEMS} />);

    const sapporoLink = screen.getByRole("link", { name: "札幌の1軒を地図にまとめる" });
    expect(sapporoLink).toHaveAttribute("href", "/sapporo?spots=spot-1");

    const otaruLink = screen.getByRole("link", { name: "小樽の3軒を地図にまとめる" });
    expect(otaruLink).toHaveAttribute("href", "/otaru?spots=spot-2,spot-3,spot-4");

    expect(screen.queryByRole("link", { name: "4軒を地図にまとめる" })).not.toBeInTheDocument();
  });

  it("単一都市のときは「N軒を地図にまとめる」のまま、全件を渡す", () => {
    render(<BookmarkList initialItems={[ITEMS[1], ITEMS[2], ITEMS[3]]} />);

    const link = screen.getByRole("link", { name: "3軒を地図にまとめる" });
    expect(link).toHaveAttribute("href", "/otaru?spots=spot-2,spot-3,spot-4");
  });

  it("SPEC §9.14-7: 削除が失敗したら元に戻し、role=alertで知らせる", async () => {
    vi.mocked(removeBookmarkAction).mockRejectedValueOnce(new Error("network"));
    render(<BookmarkList initialItems={ITEMS} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "シハチ鮮魚店 北24条店を栞から外す" }));
      await Promise.resolve();
    });

    expect(await screen.findByText("シハチ鮮魚店 北24条店")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("栞から外せませんでした。");
  });
});
