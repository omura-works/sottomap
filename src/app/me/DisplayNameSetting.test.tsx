// SPEC §9.18-1: /me「表示名」の変更 UI（成功は role="status"、失敗は role="alert"、44px 以上）。
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { changeDisplayNameAction } from "@/app/actions/display-name";
import { DisplayNameSetting } from "./DisplayNameSetting";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/app/actions/display-name", () => ({
  changeDisplayNameAction: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("DisplayNameSetting", () => {
  it("今の表示名と「表示名を変更する」（44px 以上）を出し、押すと入力欄にフォーカスする", () => {
    render(<DisplayNameSetting currentName="地元の人" />);

    expect(screen.getByRole("heading", { name: "表示名" })).toBeInTheDocument();
    expect(screen.getByText("地元の人", { exact: true })).toBeInTheDocument();
    const edit = screen.getByRole("button", { name: "表示名を変更する" });
    expect(edit).toHaveClass("min-h-11");

    fireEvent.click(edit);
    const input = screen.getByLabelText("新しい表示名");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("地元の人");
    expect(input).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "保存する" })).toHaveClass("min-h-11");
    expect(screen.getByRole("button", { name: "やめる" })).toHaveClass("min-h-11");
  });

  it("保存に成功したら、新しい名前を出して role=status で知らせる", async () => {
    vi.mocked(changeDisplayNameAction).mockResolvedValue({ ok: true, displayName: "灯りの人" });
    render(<DisplayNameSetting currentName="地元の人" />);

    fireEvent.click(screen.getByRole("button", { name: "表示名を変更する" }));
    fireEvent.change(screen.getByLabelText("新しい表示名"), { target: { value: " 灯りの人 " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    });

    expect(changeDisplayNameAction).toHaveBeenCalledWith(" 灯りの人 ");
    expect(screen.getByRole("status")).toHaveTextContent("表示名を「灯りの人」に変えました。");
    expect(screen.getByText("灯りの人", { exact: true })).toBeInTheDocument();
    expect(screen.queryByLabelText("新しい表示名")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示名を変更する" })).toHaveFocus();
    expect(refresh).toHaveBeenCalled();
  });

  it("拒否されたら role=alert で理由を出し、入力欄に結び付けて残す", async () => {
    vi.mocked(changeDisplayNameAction).mockResolvedValue({ ok: false, message: "表示名にメールアドレスは使えません" });
    render(<DisplayNameSetting currentName="地元の人" />);

    fireEvent.click(screen.getByRole("button", { name: "表示名を変更する" }));
    const input = screen.getByLabelText("新しい表示名");
    fireEvent.change(input, { target: { value: "me@example.com" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "保存する" }));
    });

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("表示名にメールアドレスは使えません");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toContain(alert.id);
    expect(input).toHaveFocus();
    expect(screen.getByText("地元の人", { exact: true })).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("「やめる」で入力欄を閉じ、「表示名を変更する」へフォーカスを戻す", () => {
    render(<DisplayNameSetting currentName="地元の人" />);

    fireEvent.click(screen.getByRole("button", { name: "表示名を変更する" }));
    fireEvent.click(screen.getByRole("button", { name: "やめる" }));

    expect(screen.queryByLabelText("新しい表示名")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "表示名を変更する" })).toHaveFocus();
    expect(changeDisplayNameAction).not.toHaveBeenCalled();
  });
});
