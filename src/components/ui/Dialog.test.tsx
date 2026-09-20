// R13 重要2（WCAG 2.4.3 / 2.4.11）: 確認ダイアログは <dialog>.showModal() のモーダル。
// 初期フォーカス、Tab／Shift+Tab の循環、Esc・背景で閉じる、処理中は閉じない、閉じたら起点へ戻る。
import { useRef, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

function Harness({ busy = false, onClose }: { busy?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const close = () => {
    onClose?.();
    if (!busy) setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        開く
      </button>
      <button type="button">背景のボタン</button>
      <Dialog
        open={open}
        title="確認の見出し"
        onClose={close}
        busy={busy}
        initialFocusRef={cancelRef}
        actions={
          <>
            <button type="button" ref={cancelRef} onClick={close}>
              やめる
            </button>
            <button type="button">変える</button>
          </>
        }
      >
        <a href="#x">本文のリンク</a>
      </Dialog>
    </>
  );
}

function openDialog() {
  const opener = screen.getByRole("button", { name: "開く" });
  opener.focus();
  fireEvent.click(opener);
  return screen.getByRole("dialog", { name: "確認の見出し" });
}

describe("Dialog（モーダル）", () => {
  it("<dialog> を showModal で開き、見出しを aria-labelledby で名前にする", () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    render(<Harness />);
    const dialog = openDialog();

    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(showModal).toHaveBeenCalledTimes(1);
    showModal.mockRestore();
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy && document.getElementById(labelledBy)).toHaveTextContent("確認の見出し");
  });

  it("initialFocusRef（やめる）に最初のフォーカスを置く", () => {
    render(<Harness />);
    openDialog();
    expect(screen.getByRole("button", { name: "やめる" })).toHaveFocus();
  });

  it("initialFocusRef が無ければ、ダイアログ内の最初のフォーカスできる要素に置く", () => {
    function NoRef() {
      return (
        <Dialog open title="見出し" onClose={() => {}} actions={<button type="button">閉じる</button>}>
          <button type="button" disabled>
            無効
          </button>
          <button type="button">最初</button>
        </Dialog>
      );
    }
    render(<NoRef />);
    expect(screen.getByRole("button", { name: "最初" })).toHaveFocus();
  });

  it("Tab は最後の要素から最初へ、Shift+Tab は最初の要素から最後へ循環し、背景へ出ない", () => {
    render(<Harness />);
    const dialog = openDialog();
    const link = screen.getByRole("link", { name: "本文のリンク" });
    const last = screen.getByRole("button", { name: "変える" });

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(link).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("Esc で閉じ、開く前にフォーカスがあった起点へ戻す", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = openDialog();

    fireEvent.keyDown(dialog, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "開く" })).toHaveFocus();
  });

  it("背景（::backdrop。dialog 要素そのもの）のクリックで閉じる。中身のクリックでは閉じない", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = openDialog();

    fireEvent.click(screen.getByText("確認の見出し"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("背景で押して中で離す・中で押して背景で離す操作では閉じない（pointerdown・click の両方が背景で起きたときだけ閉じる）", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = openDialog();
    const title = screen.getByText("確認の見出し");

    // 背景で押して、中で離す。
    fireEvent.pointerDown(dialog);
    fireEvent.click(title);
    expect(onClose).not.toHaveBeenCalled();

    // 中で押して、背景で離す。
    fireEvent.pointerDown(title);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("処理中（busy）は Esc・背景・cancel では閉じない（aria-busy はダイアログ自体には付けない）", () => {
    const onClose = vi.fn();
    render(<Harness busy onClose={onClose} />);
    const dialog = openDialog();

    expect(dialog).not.toHaveAttribute("aria-busy");
    fireEvent.keyDown(dialog, { key: "Escape" });
    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    const cancel = new Event("cancel", { cancelable: true });
    dialog.dispatchEvent(cancel);

    expect(cancel.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("ブラウザが自力で <dialog> を閉じた場合（native の close イベント）も onClose を呼び、親の状態をそろえる", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const dialog = openDialog();

    // Esc・背景以外の経路（例: Android の戻る連打で preventDefault が効かなかった場合）で
    // ブラウザが直接 close() したことを模す。
    dialog.dispatchEvent(new Event("close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("処理中（busy）にブラウザが自力で閉じても、onClose を呼ばずその場で showModal をやり直してモーダルを保つ（R14 重要1）", () => {
    const onClose = vi.fn();
    render(<Harness busy onClose={onClose} />);
    const dialog = openDialog();
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    showModal.mockClear();

    // ブラウザが自力で <dialog> を閉じた（Android の戻る連打などで preventDefault が効かなかった）ことを模す。
    (dialog as HTMLDialogElement).open = false;
    dialog.dispatchEvent(new Event("close"));

    expect(onClose).not.toHaveBeenCalled();
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("open");
    showModal.mockRestore();
  });

  it("自分自身の操作（背景クリック）で閉じた直後に続く native close イベントでは onClose を重複して呼ばない", () => {
    const onClose = vi.fn();
    // open を変えない（マウントされ続ける）ことで、自分自身の close 要求のあと native の
    // close イベントが同じ <dialog> に届くケースを再現する。
    render(
      <Dialog open title="見出し" onClose={onClose} actions={<button type="button">閉じる</button>} />,
    );
    const dialog = screen.getByRole("dialog");

    fireEvent.pointerDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);

    dialog.dispatchEvent(new Event("close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
