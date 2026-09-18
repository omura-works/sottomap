// SPEC §9.16: /me「住んでいる街」の変更 UI（確認 → 成功、制限中のエラー表示）。
// R13 重要2: 確認ダイアログはモーダル。初期フォーカスは「やめる」、処理中は開いたまま通知し、閉じたら起点へ戻す。
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { changeHomeCityAction } from "@/app/actions/home-city";
import type { ChangeHomeCityResult } from "@/app/actions/home-city";
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
    // 初期フォーカスは破壊的な「変える」ではなく「やめる」
    expect(within(dialog).getByRole("button", { name: "やめる" })).toHaveFocus();
    const confirm = within(dialog).getByRole("button", { name: "変える" });
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(changeHomeCityAction).toHaveBeenCalledWith("otaru");
    expect(screen.getByRole("status")).toHaveTextContent("住んでいる街を小樽に変えました。");
    // 閉じたら起点の「変更する」へフォーカスを戻す（編集欄は閉じている）
    expect(screen.getByRole("button", { name: "変更する" })).toHaveFocus();
    expect(screen.getByText("小樽", { exact: true })).toBeInTheDocument();
    expect(screen.getByText("次に変えられるのは2026年12月18日以降です。", { exact: true })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("確認ダイアログの「やめる」では変更せず、ダイアログを開いた「変える」へフォーカスを戻す", () => {
    render(<HomeCitySetting cities={CITIES} currentCitySlug="sapporo" nextChangeNote={null} />);

    const dialog = openConfirm("函館");
    fireEvent.click(within(dialog).getByRole("button", { name: "やめる" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changeHomeCityAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "変える" })).toHaveFocus();
  });

  it("Esc で閉じても変更せず、ダイアログを開いた「変える」へフォーカスを戻す", () => {
    render(<HomeCitySetting cities={CITIES} currentCitySlug="sapporo" nextChangeNote={null} />);

    const dialog = openConfirm("函館");
    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(changeHomeCityAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "変える" })).toHaveFocus();
  });

  it("処理中はダイアログを開いたまま、ボタンを無効にして aria-busy と「変更しています…」で知らせる", async () => {
    let resolveAction: (result: ChangeHomeCityResult) => void = () => {};
    vi.mocked(changeHomeCityAction).mockImplementation(
      () =>
        new Promise<ChangeHomeCityResult>((resolve) => {
          resolveAction = resolve;
        }),
    );
    render(<HomeCitySetting cities={CITIES} currentCitySlug="sapporo" nextChangeNote={null} />);

    const dialog = openConfirm("小樽");
    // ライブリージョンは開いた時点から常設（空）で置いておく
    const live = within(dialog).getByRole("status");
    expect(live).toHaveTextContent("");
    const confirm = within(dialog).getByRole("button", { name: "変える" });
    confirm.focus();
    await act(async () => {
      fireEvent.click(confirm);
    });

    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(live).toHaveTextContent("変更しています…");
    const cancel = within(dialog).getByRole("button", { name: "やめる" });
    expect(confirm).toHaveAttribute("aria-disabled", "true");
    expect(cancel).toHaveAttribute("aria-disabled", "true");
    // フォーカスは失われない（disabled でフォーカスが body へ落ちないよう aria-disabled にしている）
    expect(confirm).toHaveFocus();

    // 処理中は Esc・「やめる」・もう一度の「変える」では閉じない／二重に送らない
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.click(cancel);
    fireEvent.click(confirm);
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(changeHomeCityAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAction({ ok: true, cityName: "小樽", changedAt: "2026-09-18T01:00:00.000Z" });
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("住んでいる街を小樽に変えました。");
    expect(screen.getByRole("button", { name: "変更する" })).toHaveFocus();
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

    // 失敗してもダイアログは閉じず、ダイアログの中に role="alert" で理由を出す
    expect(screen.getByRole("dialog")).toBe(dialog);
    expect(dialog).not.toHaveAttribute("aria-busy");
    expect(within(dialog).getByRole("alert")).toHaveTextContent(message);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(within(dialog).getByRole("status")).toHaveTextContent("");
    expect(within(dialog).getByRole("button", { name: "変える" })).not.toHaveAttribute("aria-disabled");
    expect(screen.getByText("札幌", { exact: true })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    // 閉じたらダイアログを開いた「変える」へ戻り、理由は選択欄に結び付いて残る
    fireEvent.click(within(dialog).getByRole("button", { name: "やめる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "変える" })).toHaveFocus();
    const select = screen.getByLabelText("住んでいる街を選ぶ");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription(message);
    expect(screen.getByRole("status")).toHaveTextContent("");
  });
});
