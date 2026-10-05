import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { endorseSpot } from "@/app/actions/spot-endorse";
import { EndorseButton } from "./EndorseButton";

vi.mock("@/app/actions/spot-endorse", () => ({ endorseSpot: vi.fn() }));

afterEach(() => {
  vi.mocked(endorseSpot).mockReset();
});

describe("EndorseButton（SPEC motion §5.8）", () => {
  it("二度押しても送るのは1回。押した後は aria-disabled でフォーカスを保つ", async () => {
    let resolve: (value: { endorsementCount: number; status: "pending" }) => void = () => {};
    vi.mocked(endorseSpot).mockImplementation(() => new Promise((r) => (resolve = r)) as never);
    const user = userEvent.setup();
    render(<EndorseButton spotId="s1" citySlug="sapporo" initialCount={0} />);
    const button = screen.getByRole("button", { name: "行ったことがある" });
    await user.click(button);
    await user.click(button);
    expect(endorseSpot).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(button);
    await act(async () => resolve({ endorsementCount: 1, status: "pending" }));
    const done = screen.getByRole("button", { name: "行ったことがある ✓" });
    expect(done).toHaveAttribute("aria-disabled", "true");
    await user.click(done);
    expect(endorseSpot).toHaveBeenCalledTimes(1);
    expect(screen.getByText("承認 1/2")).toBeInTheDocument();
  });

  it("2人目で公開されたら、花丸と「地図に出ました！」", async () => {
    vi.mocked(endorseSpot).mockResolvedValue({ endorsementCount: 2, status: "published" } as never);
    const user = userEvent.setup();
    const { container } = render(<EndorseButton spotId="s1" citySlug="sapporo" initialCount={1} />);
    await user.click(screen.getByRole("button", { name: "行ったことがある" }));
    expect(await screen.findByText("2人目の「行ったことがある」で、地図に出ました！")).toBeInTheDocument();
    expect(container.querySelector(".endorse-hanamaru")).not.toBeNull();
    expect(screen.getByText("承認 2/2")).toBeInTheDocument();
    // 押されている枠は2つ（数は字で伝わるので枠は aria-hidden）
    expect(container.querySelectorAll(".endorse-frame:not(.endorse-frame-empty)")).toHaveLength(2);
    expect(container.querySelector(".endorse-frames")).toHaveAttribute("aria-hidden", "true");
  });

  it("失敗したら role=alert で知らせ、フォーカスはボタンに残る（既定の文はやわらげた文）", async () => {
    vi.mocked(endorseSpot).mockRejectedValue("network");
    const user = userEvent.setup();
    render(<EndorseButton spotId="s1" citySlug="sapporo" initialCount={0} />);
    const button = screen.getByRole("button", { name: "行ったことがある" });
    await user.click(button);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("ごめんなさい、うまくいきませんでした。もう一度押してみてください。"),
    );
    expect(document.activeElement).toBe(button);
    expect(button).not.toHaveAttribute("aria-disabled");
  });
});
