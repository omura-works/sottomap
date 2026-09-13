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
      expect(screen.getByText("栞に挟めませんでした。")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "栞に挟む" })).toBeEnabled();
    });
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
      expect(screen.getByRole("button", { name: "栞に挟む" })).toBeDisabled();
    });
  });
});
