import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { sendLoginLink } from "./actions";
import { LoginForm } from "./LoginForm";

vi.mock("./actions", () => ({ sendLoginLink: vi.fn() }));

describe("LoginForm（SPEC motion §5.9）", () => {
  it("送れたら、封筒は DOM に残って飛び、送った後の文が status の中に出てフォーカスが移る", async () => {
    vi.mocked(sendLoginLink).mockResolvedValue({ sent: true });
    const { container } = render(<LoginForm nextPath="/start" />);
    expect(container.querySelector(".login-envelope")).not.toBeNull();
    fireEvent.change(screen.getByLabelText("メールアドレス"), { target: { value: "a@example.com" } });
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "ログイン用リンクを送る" }).closest("form")!);
    });
    const sent = await screen.findByText("メールを送りました！届いたリンクを開いてくださいね。");
    expect(sent.closest('[role="status"]')).not.toBeNull();
    expect(container.querySelector(".login-envelope")).toHaveClass("is-sent");
    expect(screen.queryByRole("button", { name: "ログイン用リンクを送る" })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(sent);
  });

  it("失敗の文は role=alert で出す（サーバーが返した文のまま）", async () => {
    vi.mocked(sendLoginLink).mockResolvedValue({ error: "メールアドレスを入力してください" });
    render(<LoginForm nextPath="/start" />);
    await act(async () => {
      fireEvent.submit(screen.getByRole("button", { name: "ログイン用リンクを送る" }).closest("form")!);
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("メールアドレスを入力してください");
  });
});
