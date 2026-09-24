// /contact のフォーム（SPEC §9.17）。成功したらお礼の見出しへ、失敗したら最初の不正な入力欄へ
// フォーカスを移すこと、送るボタンが44px以上であること、個人情報の請求（privacy）の2つの経路
// （ログイン中は返信先の欄を出さない／ログインできない人は返信先必須）の案内と、用件ごとの成功時の文言を確かめる。
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { submitContactAction } from "@/app/actions/contact";
import { CONTACT_ERRORS, CONTACT_LOGIN_HREF, CONTACT_PRIVACY_COPY } from "./schema";
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
    vi.mocked(submitContactAction).mockResolvedValue({ status: "success", category: "removal" });
    render(<ContactForm spot={null} isLoggedIn={false} />);

    await submit();

    const heading = await screen.findByRole("heading", { name: "お送りしました。ありがとうございます。" });
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(heading).toHaveFocus();
    expect(heading.closest("[role='status']")).not.toBeNull();
    expect(
      screen.getByText("返信をお約束するものではありません。掲載停止のご連絡は、内容を確認でき次第、対応します。"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/速やかに/)).toBeNull();
  });

  it("個人情報の請求を送れたら「返信をお約束するものではありません」を出さず「本人確認のうえ回答します。」を出す（R20 重要3）", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({ status: "success", category: "privacy" });
    render(<ContactForm spot={null} isLoggedIn={false} />);

    await submit();

    await screen.findByRole("heading", { name: "お送りしました。ありがとうございます。" });
    expect(screen.getByText("本人確認のうえ回答します。")).toBeInTheDocument();
    expect(screen.queryByText(/返信をお約束するものではありません/)).toBeNull();
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
      message: CONTACT_ERRORS.category,
      field: "category",
    });
    render(<ContactForm spot={null} isLoggedIn={false} />);
    const privacy = screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" });
    fireEvent.click(privacy);
    fireEvent.change(screen.getByLabelText("返信用のメールアドレス（必須）"), {
      target: { value: "owner@example.com" },
    });

    await submit();

    expect(privacy).toBeChecked();
    expect(privacy).toHaveFocus();
    expect(screen.getByLabelText("返信用のメールアドレス（必須）")).toHaveValue("owner@example.com");
  });

  it("未ログインで個人情報の請求を選ぶと、2つの経路を案内し、返信先を必須にする（R20 重要3）", () => {
    render(<ContactForm spot={null} isLoggedIn={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" }));

    const note = screen.getByText(CONTACT_PRIVACY_COPY.guestNote, { exact: false });
    // 誤りではなく案内なので alert にはしない。
    expect(note).not.toHaveAttribute("role", "alert");
    expect(screen.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", CONTACT_LOGIN_HREF);
    const replyTo = screen.getByLabelText("返信用のメールアドレス（必須）");
    expect(replyTo).toHaveAttribute("aria-required", "true");
    expect(replyTo).toHaveAccessibleDescription(CONTACT_PRIVACY_COPY.guestReplyToHint);
  });

  it("未ログインの個人情報の請求で返信先が無いと、返信先の入力欄へフォーカスを移す", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({
      status: "error",
      message: CONTACT_ERRORS.privacyReplyTo,
      field: "replyTo",
    });
    render(<ContactForm spot={null} isLoggedIn={false} />);
    fireEvent.click(screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" }));

    await submit();

    expect(await screen.findByText(CONTACT_ERRORS.privacyReplyTo)).toHaveAttribute("role", "alert");
    expect(screen.getByLabelText("返信用のメールアドレス（必須）")).toHaveFocus();
  });

  it("ログイン中に個人情報の請求を選ぶと、返信先の欄を出さず（送らず）、アカウントのメールアドレス宛に回答すると案内する（R21 軽微1）", async () => {
    vi.mocked(submitContactAction).mockResolvedValue({ status: "success", category: "privacy" });
    const { container } = render(<ContactForm spot={null} isLoggedIn />);
    // 用件を選ぶ前は、返信先の欄がある（任意）。
    expect(screen.getByLabelText("返信用のメールアドレス（任意）")).toBeInTheDocument();

    const privacy = screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" });
    fireEvent.click(privacy);

    expect(screen.queryByText(CONTACT_PRIVACY_COPY.guestNote, { exact: false })).toBeNull();
    expect(screen.queryByLabelText(/返信用のメールアドレス/)).toBeNull();
    expect(container.querySelector('input[name="replyTo"]')).toBeNull();
    const note = screen.getByText(CONTACT_PRIVACY_COPY.memberNote);
    expect(note).not.toHaveAttribute("role", "alert");
    expect(screen.getByRole("group", { name: "用件" })).toHaveAccessibleDescription(CONTACT_PRIVACY_COPY.memberNote);

    await submit();
    const sent = vi.mocked(submitContactAction).mock.calls[0]?.[1];
    expect(sent?.get("category")).toBe("privacy");
    expect(sent?.has("replyTo")).toBe(false);
  });
});
