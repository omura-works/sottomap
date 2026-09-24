// /contact のフォーム（SPEC §9.17）。成功したらお礼の見出しへ、失敗したら最初の不正な入力欄へ
// フォーカスを移すこと、送るボタンが44px以上であること、未ログインで privacy を選ぶとログインへ案内することを確かめる。
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitContactAction } from "@/app/actions/contact";
import { CONTACT_ERRORS, CONTACT_LOGIN_HREF } from "./schema";
import { ContactForm } from "./ContactForm";

vi.mock("@/app/actions/contact", () => ({
  submitContactAction: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

async function submit(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "送る" }));
  });
}

describe("ContactForm", () => {
  it("送るボタンは高さ44px以上", () => {
    render(<ContactForm spot={null} isLoggedIn={false} />);
    expect(screen.getByRole("button", { name: "送る" })).toHaveStyle({ minHeight: "44px" });
  });

  it("送信に成功したら、お礼の見出し（tabIndex=-1）へフォーカスを移す", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({ status: "success" });
    render(<ContactForm spot={null} isLoggedIn={false} />);

    await submit();

    const heading = await screen.findByRole("heading", { name: "お送りしました。ありがとうございます。" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveFocus();
    expect(heading.closest("[role='status']")).not.toBeNull();
  });

  it("本文の誤りなら本文の入力欄へフォーカスを移す", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({
      status: "error",
      message: CONTACT_ERRORS.messageEmpty,
      field: "message",
    });
    render(<ContactForm spot={null} isLoggedIn={false} />);

    await submit();

    expect(await screen.findByText(CONTACT_ERRORS.messageEmpty)).toBeInTheDocument();
    expect(screen.getByLabelText("お問い合わせの内容（2000字まで）")).toHaveFocus();
  });

  it("用件の誤りなら最初の用件の選択肢へフォーカスを移す", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({
      status: "error",
      message: CONTACT_ERRORS.category,
      field: "category",
    });
    render(<ContactForm spot={null} isLoggedIn={false} />);

    await submit();

    expect(await screen.findByText(CONTACT_ERRORS.category)).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "掲載を止めてほしい" })).toHaveFocus();
  });

  it("返信先の誤りなら返信先の入力欄へフォーカスを移す", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({
      status: "error",
      message: CONTACT_ERRORS.replyTo,
      field: "replyTo",
    });
    render(<ContactForm spot={null} isLoggedIn={false} />);

    await submit();

    expect(await screen.findByText(CONTACT_ERRORS.replyTo)).toBeInTheDocument();
    expect(screen.getByLabelText("返信用のメールアドレス（任意）")).toHaveFocus();
  });

  it("失敗しても入力は消えず、用件の誤りなら選んでいる選択肢へフォーカスを移す", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({
      status: "error",
      message: CONTACT_ERRORS.privacyLogin,
      field: "category",
    });
    render(<ContactForm spot={null} isLoggedIn={false} />);
    const privacy = screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" });
    fireEvent.click(privacy);
    fireEvent.change(screen.getByLabelText("返信用のメールアドレス（任意）"), {
      target: { value: "owner@example.com" },
    });

    await submit();

    expect(privacy).toBeChecked();
    expect(privacy).toHaveFocus();
    expect(screen.getByLabelText("返信用のメールアドレス（任意）")).toHaveValue("owner@example.com");
  });

  it("未ログインで個人情報の請求を選ぶと、ログインへの案内を出す", () => {
    render(<ContactForm spot={null} isLoggedIn={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" }));

    const alert = screen.getByText(CONTACT_ERRORS.privacyLogin, { exact: false });
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", CONTACT_LOGIN_HREF);
  });

  it("ログイン中なら個人情報の請求を選んでも案内は出ない", () => {
    render(<ContactForm spot={null} isLoggedIn />);
    fireEvent.click(screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" }));
    expect(screen.queryByText(CONTACT_ERRORS.privacyLogin, { exact: false })).toBeNull();
  });
});
