// SPEC §9.16: /me「住んでいる街」の変更 UI（確認 → 成功、制限中のエラー表示）。
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeHomeCityAction } from "@/app/actions/home-city";
import { HomeCitySetting } from "./HomeCitySetting";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/actions/home-city", () => ({
  changeHomeCityAction: vi.fn(),
}));

const CITIES = [
  { slug: "sapporo", name: "札幌" },
  { slug: "otaru", name: "小樽" },
  { slug: "hakodate", name: "函館" },
];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // 東京 2026-09-18 10:00
  vi.setSystemTime(new Date("2026-09-18T01:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

function openConfirm(cityName: string) {
  fireEvent.click(screen.getByRole("button", { name: "変更する" }));
  fireEvent.change(screen.getByLabelText("住んでいる街を選ぶ"), {
    target: { value: CITIES.find((city) => city.name === cityName)?.slug },
  });
  fireEvent.click(screen.getByRole("button", { name: "変える" }));
  return screen.getByRole("dialog", {
    name: `住んでいる街を${cityName}に変えますか。次に変えられるのは2026年12月18日以降です。`,
  });
}

describe("HomeCitySetting", () => {
  it("今の住んでいる街と「変更する」（44px 以上）を表示し、選択肢に今の街は出さない", () => {
    render(<HomeCitySetting cities={CITIES} currentCitySlug="sapporo" nextChangeNote={null} />);

    expect(screen.getByRole("heading", { name: "住んでいる街" })).toBeInTheDocument();
    expect(screen.getByText("札幌", { exact: true })).toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "変更する" });
    expect(edit).toHaveClass("min-h-11");

    fireEvent.click(edit);
    const select = screen.getByLabelText("住んでいる街を選ぶ");
    expect(select).toHaveFocus();
    const options = within(select).getAllByRole("option").map((option) => option.textContent);
    expect(options).toEqual(["小樽", "函館"]);
  });

  it("確認ダイアログで「変える」を押すと変更し、role=status で知らせる", async () => {
    vi.mocked(changeHomeCityAction).mockResolvedValue({
      ok: true,
      cityName: "小樽",
      changedAt: "2026-09-18T01:00:00.000Z",
    });
    render(<HomeCitySetting cities={CITIES} currentCitySlug="sapporo" nextChangeNote={null} />);

    const dialog = openConfirm("小樽");
    const confirm = within(dialog).getByRole("button", { name: "変える" });
    expect(confirm).toHaveFocus();
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(changeHomeCityAction).toHaveBeenCalledWith("otaru");
    expect(screen.getByRole("status")).toHaveTextContent("住んでいる街を小樽に変えました。");
    expect(screen.getByText("小樽", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("次に変えられるのは2026年12月18日以降です。", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("確認ダイアログの「やめる」では変更しない", () => {
    render(<HomeCitySetting cities={CITIES} currentCitySlug="sapporo" nextChangeNote={null} />);

    const dialog = openConfirm("函館");
    fireEvent.click(within(dialog).getByRole("button", { name: "やめる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changeHomeCityAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "変える" })).toHaveFocus();
  });

  it("制限中に拒否されたら、理由を role=alert で表示し、住んでいる街は変わらない", async () => {
    const message = "住んでいる街は90日に1回まで変えられます。次に変えられるのは2026年11月2日以降です。";
    vi.mocked(changeHomeCityAction).mockResolvedValue({ ok: false, message });
    render(
      <HomeCitySetting
        cities={CITIES}
        currentCitySlug="sapporo"
        nextChangeNote="次に変えられるのは2026年11月2日以降です。"
      />,
    );
    expect(screen.getByText("次に変えられるのは2026年11月2日以降です。", { exact: true })).toBeInTheDocument();

    const dialog = openConfirm("小樽");
    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: "変える" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText("住んでいる街を選ぶ")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("札幌", { exact: true })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(refresh).not.toHaveBeenCalled();
  });
});
