import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyForm } from "./VerifyForm";
import { submitVerification } from "@/app/actions/spot-verify";

vi.mock("@/app/actions/spot-verify", () => ({
  submitVerification: vi.fn(),
}));

const mockedSubmit = submitVerification as unknown as ReturnType<typeof vi.fn>;

describe("VerifyForm", () => {
  beforeEach(() => {
    mockedSubmit.mockReset();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("SPEC §9.14-14: Server Action の Promise 自体が reject したら role=alert のインラインエラーを出す", async () => {
    mockedSubmit.mockRejectedValueOnce(new Error("network error"));

    render(
      <VerifyForm requestId="req-1" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("確認の記録に失敗しました");
  });

  it("SPEC §9.14-1: wasDormant=true かつ status=published なら「地図に戻りました。」を表示する", async () => {
    mockedSubmit.mockResolvedValueOnce({
      ok: true,
      accepted: true,
      pointsAwarded: 5,
      totalPoints: 5,
      badges: [],
      status: "published",
    });

    render(
      <VerifyForm requestId="req-2" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} wasDormant />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });

    expect(await screen.findByText("地図に戻りました。")).toBeInTheDocument();
  });

  it("wasDormant=true でも status が published 以外なら「地図に戻りました。」は出さない", async () => {
    mockedSubmit.mockResolvedValueOnce({
      ok: true,
      accepted: true,
      pointsAwarded: 5,
      totalPoints: 5,
      badges: [],
      status: "dormant",
    });

    render(
      <VerifyForm requestId="req-3" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} wasDormant />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });

    await screen.findByText("静かなまま", { selector: "*" });
    expect(screen.queryByText("地図に戻りました。")).not.toBeInTheDocument();
  });
});
