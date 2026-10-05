import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { City } from "@/lib/db/types";
import { NewSpotForm } from "./NewSpotForm";
import { POSITION_REQUIRED_ERROR } from "./schema";

// SPEC §9.14-14: 範囲外の緯度・経度でも MapLibre（実MapCanvas）へピンを渡さないことを検証する。
// 実MapCanvasはmaplibre-gl依存のため、pinsプロパティだけを見えるようにモックする。
let lastPins: unknown[] = [];
let lastClick: ((point: { lat: number; lng: number }) => void) | undefined;
vi.mock("@/components/map", () => ({
  MapCanvas: (props: { pins: unknown[]; onBackgroundClick?: (point: { lat: number; lng: number }) => void }) => {
    lastPins = props.pins;
    lastClick = props.onBackgroundClick;
    return <div data-testid="map-canvas" />;
  },
}));

vi.mock("@/app/actions/spot-create", () => ({
  createSpotAction: vi.fn(),
}));

const CITY: City = {
  id: "city-1",
  slug: "sapporo",
  name: "札幌",
  nameKana: "さっぽろ",
  isPort: false,
  centerLat: 43.0621,
  centerLng: 141.3544,
  defaultZoom: 12.5,
  featuredArea: "北24条",
};

describe("NewSpotForm", () => {
  it("SPEC §9.14-14: 範囲外の緯度（91）を入力してもピンを生成せず、送信できない", () => {
    render(<NewSpotForm city={CITY} />);

    fireEvent.change(screen.getByLabelText("緯度"), { target: { value: "91" } });
    fireEvent.change(screen.getByLabelText("経度"), { target: { value: "141" } });

    expect(lastPins).toHaveLength(0);
    expect(screen.getByRole("button", { name: "ピンを立てる" })).toBeDisabled();
  });

  it("範囲内の緯度・経度を入力するとピンが生成され、送信できる", () => {
    render(<NewSpotForm city={CITY} />);

    fireEvent.change(screen.getByLabelText("緯度"), { target: { value: "43.05" } });
    fireEvent.change(screen.getByLabelText("経度"), { target: { value: "141.35" } });

    expect(lastPins).toHaveLength(1);
    expect(screen.getByRole("button", { name: "ピンを立てる" })).not.toBeDisabled();
  });

  it("緯度・経度の入力欄に min/max が設定されている", () => {
    render(<NewSpotForm city={CITY} />);

    expect(screen.getByLabelText("緯度")).toHaveAttribute("min", "-90");
    expect(screen.getByLabelText("緯度")).toHaveAttribute("max", "90");
    expect(screen.getByLabelText("経度")).toHaveAttribute("min", "-180");
    expect(screen.getByLabelText("経度")).toHaveAttribute("max", "180");
  });

  describe("SPEC motion §5.8: 見た目の文と動きのための状態", () => {
    it("新しい文: 題・文・リード・補足・頻度の見出し。未選択の注意は schema と同じ文", () => {
      render(<NewSpotForm city={CITY} />);
      expect(screen.getByRole("heading", { level: 1, name: "まだ知られていない店を、一軒" })).toBeInTheDocument();
      expect(screen.getByText("あなたがふだん通っている、あの店を教えてください。")).toBeInTheDocument();
      expect(screen.getByText("地図をタップして、ピンを置いてね")).toBeInTheDocument();
      expect(screen.getByText("地図をクリック（タップ）した場所にピンが立ちます。一度も置かないままだと、送れません。")).toBeInTheDocument();
      expect(screen.getByText("ひとことで大丈夫です。")).toBeInTheDocument();
      expect(screen.getByText("正直に、どのくらい行きますか？")).toBeInTheDocument();
      expect(POSITION_REQUIRED_ERROR).toBe("地図で場所を選ぶか、緯度・経度を入れてください");
      expect(screen.getByText(POSITION_REQUIRED_ERROR)).toBeInTheDocument();
      expect(screen.getByRole("radiogroup", { name: "行く頻度" })).toBeInTheDocument();
    });

    it("3段の提灯が、位置・名前（空白だけは数えない）・理由に合わせて灯る", () => {
      const { container } = render(<NewSpotForm city={CITY} />);
      const lit = () => Array.from(container.querySelectorAll(".new-spot-lanterns .lantern")).map((el) => el.getAttribute("data-lit"));
      expect(lit()).toEqual(["false", "false", "false"]);
      fireEvent.change(screen.getByLabelText("緯度"), { target: { value: "43.05" } });
      fireEvent.change(screen.getByLabelText("経度"), { target: { value: "141.35" } });
      expect(lit()).toEqual(["true", "false", "false"]);
      fireEvent.change(screen.getByLabelText("店の名前"), { target: { value: "   " } });
      expect(lit()).toEqual(["true", "false", "false"]);
      fireEvent.change(screen.getByLabelText("店の名前"), { target: { value: "喫茶" } });
      fireEvent.change(screen.getByLabelText("なぜ、あなたはここへ行くのか（60字まで）"), { target: { value: "静か" } });
      expect(lit()).toEqual(["true", "true", "true"]);
    });

    it("地図をタップするたびにピンの stampKey が変わる（手で入れたときは変わらない）", () => {
      render(<NewSpotForm city={CITY} />);
      act(() => lastClick?.({ lat: 43.05, lng: 141.35 }));
      const first = (lastPins[0] as { stampKey: string }).stampKey;
      act(() => lastClick?.({ lat: 43.06, lng: 141.36 }));
      const second = (lastPins[0] as { stampKey: string }).stampKey;
      expect(second).not.toBe(first);
      fireEvent.change(screen.getByLabelText("緯度"), { target: { value: "43.07" } });
      expect((lastPins[0] as { stampKey: string }).stampKey).toBe(second);
    });
  });
});
