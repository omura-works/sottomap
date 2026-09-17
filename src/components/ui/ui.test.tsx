import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";
import { Tag } from "./Tag";
import { Field } from "./Field";

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
    expect(screen.getByText("21/60")).toBeInTheDocument();
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
