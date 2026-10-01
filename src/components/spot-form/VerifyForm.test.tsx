import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VerifyForm } from "./VerifyForm";
import { submitVerification } from "@/app/actions/spot-verify";
import { badgeThreshold } from "@/lib/domain/lantern";
import { mockReducedMotion } from "@/components/motion/test-utils";

vi.mock("@/app/actions/spot-verify", () => ({
  submitVerification: vi.fn(),
}));

// 判子の飛行（灯りの層）を見張る
const lamp = vi.hoisted(() => ({
  fly: vi.fn((_from: unknown, _to: unknown, opts?: { onArrive?: () => void }) => opts?.onArrive?.()),
  target: vi.fn((name: string) => document.querySelector(`[data-lamp-target='${name}']`)),
  bump: vi.fn(),
}));
vi.mock("@/components/motion/LampLayer", () => ({ useLamp: () => lamp }));

const mockedSubmit = submitVerification as unknown as ReturnType<typeof vi.fn>;

describe("VerifyForm", () => {
  beforeEach(() => {
    mockedSubmit.mockReset();
    lamp.fly.mockClear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    expect(alert).toHaveTextContent("ごめんなさい、うまく記録できませんでした。もう一度押してみてください。");
    // 受け付けられる前・エラーでは判子を飛ばさない
    expect(lamp.fly).not.toHaveBeenCalled();
  });

  it("サーバーが返した理由の文はそのまま出し、判子は飛ばさない", async () => {
    mockedSubmit.mockResolvedValueOnce({ ok: false, error: "この確認はもう受け付けていません。" });
    render(<VerifyForm requestId="req-x" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("この確認はもう受け付けていません。");
    expect(lamp.fly).not.toHaveBeenCalled();
  });

  it("受け付けられたら「ありがとう！」と +N、判子が店のカードの置き場へ飛んで押される", async () => {
    mockedSubmit.mockResolvedValueOnce({ ok: true, accepted: true, pointsAwarded: 5, totalPoints: 5, badges: [], status: "published" });
    const { container } = render(<VerifyForm requestId="req-y" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "並びはじめた" }));
    });
    expect(await screen.findByText("ありがとう！")).toBeInTheDocument();
    expect(screen.getByText("灯りがひとつ、ともりました。")).toBeInTheDocument();
    expect(screen.getByText("+5", { exact: true })).toBeInTheDocument();
    expect(lamp.fly).toHaveBeenCalledTimes(1);
    expect(lamp.fly.mock.calls[0][2]).toMatchObject({ kind: "stamp", glyph: "並", tone: "crowding" });
    expect(container.querySelector(".verify-slot .stamp")).toHaveTextContent("並");
    expect(container.querySelector(".verify-hanamaru")).not.toBeNull();
  });

  it("演出 OFF: 紙のカードに「ありがとう！」と答えだけ。+N・番人の棒・花丸は出さない", async () => {
    window.localStorage.setItem("urasupo:showRewards", "false");
    mockedSubmit.mockResolvedValueOnce({
      ok: true,
      accepted: true,
      pointsAwarded: 5,
      totalPoints: 5,
      badges: [{ id: "keeper", slug: "keeper", glyph: "灯", label: "灯りの番人", earned: false, remaining: 3 }],
      status: "published",
    });
    const { container } = render(<VerifyForm requestId="req-z" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />);
    const checkbox = screen.getByRole("checkbox", { name: "回答後の灯り演出（+5 など）を表示する" });
    if ((checkbox as HTMLInputElement).checked) fireEvent.click(checkbox);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });
    expect(await screen.findByText("ありがとう！")).toBeInTheDocument();
    expect(screen.queryByText("+5", { exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(container.querySelector(".verify-hanamaru")).toBeNull();
  });

  it("番人の棒: +N の灯りが飛び込むまでは今回の1件を数える前の値、着いたら新しい値", async () => {
    const spy = mockReducedMotion(false);
    mockedSubmit.mockResolvedValueOnce({
      ok: true,
      accepted: true,
      pointsAwarded: 5,
      totalPoints: 5,
      badges: [{ id: "keeper", slug: "keeper", glyph: "灯", label: "灯りの番人", earned: false, remaining: 15 }],
      status: "published",
    });
    render(<VerifyForm requestId="req-k" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });
    const threshold = badgeThreshold("keeper");
    const bar = await screen.findByRole("progressbar", { name: "灯りの番人の進み具合" }, { timeout: 2000 });
    expect(Number(bar.style.getPropertyValue("--p"))).toBeCloseTo((threshold - 15 - 1) / threshold, 5);
    // 受け付けから 1100ms 後に灯りが棒の先へ飛び、着いたら新しい値になる
    await waitFor(() => expect(Number(bar.style.getPropertyValue("--p"))).toBeCloseTo((threshold - 15) / threshold, 5), {
      timeout: 3000,
    });
    expect(lamp.fly.mock.calls.some(([, , opts]) => (opts as { kind?: string }).kind === "lamp")).toBe(true);
    spy.mockRestore();
  });

  it("reduce: 棒は最初から新しい値、花丸は描かずに出す", async () => {
    const spy = mockReducedMotion(true);
    mockedSubmit.mockResolvedValueOnce({
      ok: true,
      accepted: true,
      pointsAwarded: 5,
      totalPoints: 5,
      badges: [{ id: "keeper", slug: "keeper", glyph: "灯", label: "灯りの番人", earned: false, remaining: 15 }],
      status: "published",
    });
    const { container } = render(<VerifyForm requestId="req-r" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "静かなまま" }));
    });
    const threshold = badgeThreshold("keeper");
    const bar = await screen.findByRole("progressbar", { name: "灯りの番人の進み具合" });
    expect(Number(bar.style.getPropertyValue("--p"))).toBeCloseTo((threshold - 15) / threshold, 5);
    expect(container.querySelector(".verify-hanamaru .verb-draw")).toBeNull();
    expect(lamp.fly.mock.calls.some(([, , opts]) => (opts as { kind?: string }).kind === "lamp")).toBe(false);
    spy.mockRestore();
  });

  it("履歴が無ければ「これが最初の確認です。」", () => {
    render(<VerifyForm requestId="req-h" spotName="シハチ鮮魚店 北24条店" daysSinceLast={90} history={[]} />);
    expect(screen.getByText("これが最初の確認です。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "これまでの答え" })).toBeInTheDocument();
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
