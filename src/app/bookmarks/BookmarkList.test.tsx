import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BookmarkList } from "./BookmarkList";
import type { BookmarkListItem } from "./BookmarkList";

vi.mock("@/app/actions/bookmark-actions", () => ({
  removeBookmarkAction: vi.fn(),
}));

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
});
