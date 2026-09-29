import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { Tag } from "./Tag";
import { Field } from "./Field";
import { Segment } from "./Segment";
import { Chip } from "./Chip";

describe("Button", () => {
  it("variant に応じたクラスを付与する", () => {
    render(<Button variant="primary">歩きはじめる</Button>);
    const button = screen.getByRole("button", { name: "歩きはじめる" });
    expect(button).toHaveClass("btn", "btn-primary");
  });
});

describe("Tag", () => {
  it("as='button' のとき aria-pressed を反映する", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <Tag as="button" kind="outline" selected={false} onClick={onClick}>
        札幌
      </Tag>,
    );
    const tag = screen.getByRole("button", { name: "札幌" });
    expect(tag).toHaveAttribute("aria-pressed", "false");
    await user.click(tag);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("Field", () => {
  it("maxLength 指定時に文字数カウンタを表示する", () => {
    render(
      <Field
        label="なぜ、あなたはここへ行くのか（60字まで）"
        maxLength={60}
        value="観光客は三角市場へ行く。地元は南樽で買う。"
        onChange={() => {}}
      />,
    );
    const counter = document.querySelector(".field-counter");
    expect(counter).toHaveTextContent("21/60");
    expect(counter?.querySelector(".field-count")).toHaveTextContent("21");
    // 残り 39 字: まだ「あと N 字」は出さない
    expect(counter).toHaveAttribute("data-near", "false");
    expect(counter).toHaveAttribute("data-full", "false");
    expect(counter).not.toHaveTextContent("あと");
  });

  it("SPEC motion §5.8.1: 残り 10 字で data-near と「あと N 字」、0 字で data-full", () => {
    const { rerender } = render(<Field label="理由" maxLength={60} value={"あ".repeat(50)} onChange={() => {}} />);
    const counter = () => document.querySelector(".field-counter");
    expect(counter()).toHaveAttribute("data-near", "true");
    expect(counter()).toHaveAttribute("data-full", "false");
    expect(counter()).toHaveTextContent("50/60 あと10字");
    rerender(<Field label="理由" maxLength={60} value={"あ".repeat(49)} onChange={() => {}} />);
    expect(counter()).toHaveAttribute("data-near", "false");
    rerender(<Field label="理由" maxLength={60} value={"あ".repeat(60)} onChange={() => {}} />);
    expect(counter()).toHaveAttribute("data-full", "true");
    expect(counter()).toHaveTextContent("60/60 あと0字");
  });

  it("maxLength 未指定ならカウンタを表示しない", () => {
    render(<Field label="店の名前" value="南樽市場" onChange={() => {}} />);
    expect(screen.queryByText(/\/\d+/)).not.toBeInTheDocument();
  });

  it("SPEC §9.14-16: error（エラー文）を aria-describedby / aria-invalid で入力欄に結び付ける", () => {
    render(<Field label="緯度" value="" onChange={() => {}} error="緯度は-90から90の範囲で入力してください" />);
    const input = screen.getByLabelText("緯度");
    const hint = screen.getByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(hint.id);
    expect(hint).toHaveTextContent("緯度は-90から90の範囲で入力してください");
  });

  it("SPEC §9.14-16: description（補足）は aria-invalid も role=alert も付けない", () => {
    render(<Field label="なぜここへ行くのか" value="" onChange={() => {}} description="正直な理由を一言で。" />);
    const input = screen.getByLabelText("なぜここへ行くのか");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("正直な理由を一言で。")).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toBe(screen.getByText("正直な理由を一言で。").id);
  });
});

describe("Field の文字数の跳ね（境目をまたいだときだけ）", () => {
  const renderCount = (n: number) => <Field label="理由" maxLength={60} value={"あ".repeat(n)} onChange={() => {}} />;
  const counter = () => document.querySelector(".field-counter");

  it("最初の描画では、残り10字以下でも跳ねない", () => {
    render(renderCount(55));
    expect(counter()).toHaveAttribute("data-near", "true");
    expect(counter()).not.toHaveAttribute("data-bump");
  });

  it("残り10字・0字をまたいだときだけ跳ね、1字ごとには跳ねない", () => {
    const { rerender } = render(renderCount(40));
    rerender(renderCount(49));
    expect(counter()).not.toHaveAttribute("data-bump");
    rerender(renderCount(50));
    expect(counter()).toHaveAttribute("data-bump", "a");
    rerender(renderCount(55));
    expect(counter()).toHaveAttribute("data-bump", "a");
    rerender(renderCount(60));
    expect(counter()).toHaveAttribute("data-bump", "b");
    rerender(renderCount(40));
    expect(counter()).toHaveAttribute("data-bump", "b");
    expect(counter()).toHaveAttribute("data-near", "false");
  });
});

describe("Segment", () => {
  const options = [
    { value: "weekly", label: "週1で行く" },
    { value: "monthly", label: "月1" },
    { value: "yearly", label: "年に数回" },
  ];

  it("既定（fill）は今のラジオのまま", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Segment aria-label="行く頻度" options={options} value="weekly" onChange={onChange} />);
    const group = screen.getByRole("radiogroup", { name: "行く頻度" });
    expect(group).toHaveAttribute("data-variant", "fill");
    expect(screen.getByRole("radio", { name: "週1で行く" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "月1" }));
    expect(onChange).toHaveBeenCalledWith("monthly");
    expect(group.querySelector(".seg-circle")).toBeNull();
  });

  it("SPEC motion §2.9: variant=circle は選んだ字を手描きの丸（飾り）で囲み、選択を属性でも持つ", () => {
    render(<Segment aria-label="行く頻度" variant="circle" options={options} value="monthly" onChange={() => {}} />);
    const group = screen.getByRole("radiogroup", { name: "行く頻度" });
    expect(group).toHaveAttribute("data-variant", "circle");
    const selected = screen.getByRole("radio", { name: "月1" }).closest("label");
    expect(selected).toHaveAttribute("data-on", "true");
    const circle = selected?.querySelector("svg.seg-circle");
    expect(circle).not.toBeNull();
    expect(circle).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("radio", { name: "週1で行く" }).closest("label")).toHaveAttribute("data-on", "false");
    // 丸は字の名前に混ざらない
    expect(screen.getByRole("radio", { name: "月1" })).toBeChecked();
  });
});

describe("Chip", () => {
  it("塗りの層は読み上げず、選択を data-on で持つ", () => {
    render(
      <button type="button" className="chip-hit" aria-pressed="true">
        <Chip on>札幌</Chip>
      </button>,
    );
    const button = screen.getByRole("button", { name: "札幌" });
    const chip = button.querySelector(".chip");
    expect(chip).toHaveAttribute("data-on", "true");
    expect(chip?.querySelector(".chip-fill")).toHaveAttribute("aria-hidden", "true");
  });
});
