import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addBookmarkAction } from "@/app/actions/bookmark-actions";
import { BookmarkButton } from "./BookmarkButton";

vi.mock("@/app/actions/bookmark-actions", () => ({
  addBookmarkAction: vi.fn(),
}));

describe("BookmarkButton", () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("Server Actionが失敗したら楽観表示を元に戻して失敗を伝える", async () => {
    let rejectAction: (reason: Error) => void = () => {};
    vi.mocked(addBookmarkAction).mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAction = reject;
        }),
    );
    const user = userEvent.setup();
    render(<BookmarkButton spotId="spot-1" initiallyBookmarked={false} />);

    await user.click(screen.getByRole("button", { name: "栞に挟む" }));
    expect(screen.getByText("栞に挟みました。")).toBeInTheDocument();

    await act(async () => rejectAction(new Error("network error")));

    await waitFor(() => {
      expect(screen.queryByText("栞に挟みました。")).not.toBeInTheDocument();
      // 失敗は role="alert"（SPEC motion §4.7）
      expect(screen.getByRole("alert")).toHaveTextContent("ごめんなさい、栞に挟めませんでした。もう一度押してみてください。");
      expect(screen.getByRole("button", { name: "栞に挟む" })).not.toHaveAttribute("aria-disabled");
    });
  });

  it("SPEC motion §5.2: 挟んだ瞬間に sotto:bookmarked が1回出て、失敗したら sotto:bookmark-failed が出る", async () => {
    let rejectAction: (reason: Error) => void = () => {};
    vi.mocked(addBookmarkAction).mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAction = reject;
        }),
    );
    const bookmarked = vi.fn();
    const failed = vi.fn();
    const onBookmarked = (event: Event) => bookmarked((event as CustomEvent<{ spotId: string }>).detail.spotId);
    const onFailed = (event: Event) => failed((event as CustomEvent<{ spotId: string }>).detail.spotId);
    window.addEventListener("sotto:bookmarked", onBookmarked);
    window.addEventListener("sotto:bookmark-failed", onFailed);
    try {
      const user = userEvent.setup();
      render(<BookmarkButton spotId="spot-1" initiallyBookmarked={false} />);
      await user.click(screen.getByRole("button", { name: "栞に挟む" }));
      expect(bookmarked).toHaveBeenCalledTimes(1);
      expect(bookmarked).toHaveBeenCalledWith("spot-1");
      expect(failed).not.toHaveBeenCalled();

      await act(async () => rejectAction(new Error("network error")));
      await waitFor(() => expect(failed).toHaveBeenCalledWith("spot-1"));
      expect(bookmarked).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("sotto:bookmarked", onBookmarked);
      window.removeEventListener("sotto:bookmark-failed", onFailed);
    }
  });

  it("挟んだ後もボタンにフォーカスが残り、もう一度押しても何もしない。確認の文は status で読み上げる", async () => {
    vi.mocked(addBookmarkAction).mockImplementation(() => new Promise<void>(() => {}));
    const user = userEvent.setup();
    render(<BookmarkButton spotId="spot-1" initiallyBookmarked={false} />);
    const button = screen.getByRole("button", { name: "栞に挟む" });
    await user.click(button);
    expect(document.activeElement).toBe(button);
    await user.click(button);
    expect(addBookmarkAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("栞に挟みました。");
  });

  it("Server Actionが成功したら確定表示を維持する", async () => {
    let resolveAction: () => void = () => {};
    vi.mocked(addBookmarkAction).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const user = userEvent.setup();
    render(<BookmarkButton spotId="spot-1" initiallyBookmarked={false} />);

    await user.click(screen.getByRole("button", { name: "栞に挟む" }));
    expect(screen.getByText("栞に挟みました。")).toBeInTheDocument();

    await act(async () => resolveAction());

    await waitFor(() => {
      expect(screen.getByText("栞に挟みました。")).toBeInTheDocument();
      // disabled にはせず（フォーカスを失わない）、aria-disabled で押せないことを伝える
      const button = screen.getByRole("button", { name: "栞に挟む" });
      expect(button).toBeEnabled();
      expect(button).toHaveAttribute("aria-disabled", "true");
    });
  });
});
