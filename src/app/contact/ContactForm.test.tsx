import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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
  it("送るボタンは高さ44px以上（SPEC motion §5.10: 大きい主ボタン .btn-lg＝56px。実際の高さは e2e/contact.spec.ts で測る）", () => {
    render(<ContactForm spot={null} isLoggedIn={false} />);
    expect(screen.getByRole("button", { name: "送る" })).toHaveClass("btn-lg");
    // .btn-lg の高さの指定そのものを globals.css から読んで 44px 以上を確かめる（jsdom は CSS を当てないため）
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf(".btn-lg {"), css.indexOf("}", css.indexOf(".btn-lg {")));
    const minHeight = Number(/min-height:\s*(\d+)px/.exec(block)?.[1]);
    expect(minHeight).toBeGreaterThanOrEqual(44);
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

  it("退会して以前のお問い合わせのアドレスが無い人には、いま受信できるアドレスを書けばよいと案内する（R23 軽微）", () => {
    expect(CONTACT_PRIVACY_COPY.guestReplyToHint).toBe(
      "登録しているメールアドレスをご記入ください（退会した場合は、以前のお問い合わせに書いたメールアドレス。無ければ、いま受信できるメールアドレス）。本人確認のため、運営からこのアドレス宛に確認のメールを送ります。",
    );
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
    // 表示時にログイン中だったことをサーバーへ知らせる（送信時に期限が切れていたら、専用の文言で返すため）。
    expect(sent?.get("signedIn")).toBe("1");
  });

  it("表示時はログイン中でも、送信時にログインの期限が切れていたら、返信先の欄を出し、そのそばに誤りを出してフォーカスを移す（R22 重要1）", async () => {
    // サーバー（submitContactAction）と同じ判断: 表示時ログイン（signedIn=1）なのに送信時は未ログイン。
    vi.mocked(submitContactAction).mockImplementation(async (_prev, formData) =>
      formData.get("signedIn") === "1" && !formData.get("replyTo")
        ? { status: "error", message: CONTACT_ERRORS.sessionExpired, field: "replyTo", sessionExpired: true }
        : { status: "success", category: "privacy" },
    );
    render(<ContactForm spot={null} isLoggedIn />);
    fireEvent.click(screen.getByRole("radio", { name: "自分の個人情報について（開示・訂正・削除・利用停止）" }));
    expect(screen.queryByLabelText(/返信用のメールアドレス/)).toBeNull();

    await submit();

    const error = await screen.findByText(CONTACT_ERRORS.sessionExpired);
    expect(error).toHaveAttribute("role", "alert");
    const replyTo = screen.getByLabelText("返信用のメールアドレス（必須）");
    expect(replyTo).toHaveFocus();
    expect(replyTo).toHaveAttribute("aria-invalid", "true");
    expect(replyTo).toHaveAttribute("aria-describedby", expect.stringContaining(error.id));
    // 未ログインの案内（ログインし直す導線）に切り替わる。
    expect(screen.getByRole("link", { name: "ログインする" })).toHaveAttribute("href", CONTACT_LOGIN_HREF);
    expect(screen.queryByText(CONTACT_PRIVACY_COPY.memberNote)).toBeNull();

    // 返信先を書いて送り直すと、もうログイン中としては送らない。別の誤りが返っても欄は出たまま。
    vi.mocked(submitContactAction).mockResolvedValueOnce({
      status: "error",
      message: CONTACT_ERRORS.messageEmpty,
      field: "message",
    });
    fireEvent.change(replyTo, { target: { value: "owner@example.com" } });
    await submit();
    const resent = vi.mocked(submitContactAction).mock.calls[1]?.[1];
    expect(resent?.get("replyTo")).toBe("owner@example.com");
    expect(resent?.has("signedIn")).toBe(false);
    expect(await screen.findByText(CONTACT_ERRORS.messageEmpty)).toBeInTheDocument();
    expect(screen.getByLabelText("返信用のメールアドレス（必須）")).toHaveValue("owner@example.com");
  });
});
