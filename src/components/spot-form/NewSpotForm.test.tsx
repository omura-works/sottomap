import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { City } from "@/lib/db/types";
import { NewSpotForm } from "./NewSpotForm";

// SPEC §9.14-14: 範囲外の緯度・経度でも MapLibre（実MapCanvas）へピンを渡さないことを検証する。
// 実MapCanvasはmaplibre-gl依存のため、pinsプロパティだけを見えるようにモックする。
let lastPins: unknown[] = [];
vi.mock("@/components/map", () => ({
  MapCanvas: (props: { pins: unknown[] }) => {
    lastPins = props.pins;
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
});
