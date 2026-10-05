// Rare UI (MIT) https://rareui.com — そっとマップ向けに調整
// 出典: https://github.com/swamimalode07/rare-ui（`.superpowers/sdd/urasupo/rareui/delete-button.json`
// の `DeleteButton`。そっとマップでは栞の「外す」ボタンとして使うため `ConfirmRemoveButton` に改名）。
// 調整点:
// - 色の固定値（#F4F4F9 等）をすべてデザイントークン（src/app/globals.css）に置き換え、
//   ダークモードの指定は削除（そっとマップはライトのみ）。
// - ラベルを日本語化。トリガーの aria-label は呼び出し側から渡す `label` に、
//   確定は「外す」、取り消しは「やめる」、状態の読み上げは「栞から外しました。」/
//   「そのままにしました。」に変更。
// - 確定・取り消しの丸ボタンは見た目28pxのまま、当たり判定だけ44×44px以上に広げた
//   （SPEC §9.14-14）。パネル幅もそれに合わせて広げた。
// - `cn` の import元を `@/lib/utils` → `@/components/ui/cn` に変更。
// - Codex R8 重要3: 確定（外す）で行自体がアンマウントされる呼び出し側（BookmarkList）では
//   コンポーネント内蔵の状態読み上げが失われるため、内蔵の live region は削除し、
//   `onTriggerRef` でトリガーの参照を呼び出し側に渡してフォーカス管理を委ねる形に変更。
//   フォーカスの自動移動は「やめる」（行が残る）のときのみ内部で行う。
"use client";

import { useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";
import {
  animate,
  AnimatePresence,
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type Transition,
} from "motion/react";
import { cn } from "./cn";

const HINGE = "3px 6px";
const LID_OPEN = -35;
const WALL_TOP = 6;
const WALL_TOP_OPEN = 13.5;
const WALL_BASE = 20;

const TILE = 48;
// 確定・取り消しの当たり判定（44px）× 2 + gap(8px) + 左右の余白(20px) の分だけ確保する。
const PANEL = 116;
const HOLD = { deleted: 1400, kept: 600 };

const EASE = [0.32, 0.72, 0, 1] as const;
const EASE_LID = [0.34, 1.1, 0.64, 1] as const;

const WIDTH = { duration: 0.62, ease: EASE } as const;
const LID = { duration: 0.6, ease: EASE_LID } as const;
const WALL = { duration: 0.56, ease: EASE } as const;
const IN = { duration: 0.44, ease: EASE, delay: 0.14 } as const;
const OUT = { duration: 0.3, ease: EASE } as const;
const TAP = { duration: 0.2, ease: EASE } as const;
const SWAP = { duration: 0.22, ease: EASE } as const;
const SETTLE = { duration: 0.45, ease: EASE } as const;
const PRESS = {
  type: "spring",
  stiffness: 520,
  damping: 18,
  mass: 0.5,
} as const;
const INSTANT = { duration: 0 } as const;

// 面（トレー・パネル背景）はneutral/bg系、確定の印はaccent系（SPEC §5 デザイントークン）。
const SURFACE = "bg-[var(--color-neutral-100)]";
const RECESS = "bg-[var(--color-neutral-200)]";
const GLYPH = "text-[var(--color-neutral-700)]";
// フォーカスの輪は全体の :focus-visible（2px の accent-600 の線、2px 離す。§6.3）に任せる。ほかの部品と同じ輪にするため
const FOCUS = "";
const ACCENT = "var(--color-accent-700)";

const CIRCLE = `grid h-7 w-7 place-items-center rounded-full transition-colors duration-200 hover:bg-[var(--color-neutral-100)] ${SURFACE} shadow-sm`;

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const panelMotion = {
  hidden: { opacity: 0, x: -6, transition: OUT },
  shown: { opacity: 1, x: 0, transition: { ...IN, staggerChildren: 0.07 } },
};

const circleMotion = {
  hidden: { opacity: 0, scale: 0.9, transition: OUT },
  shown: { opacity: 1, scale: 1, transition: IN },
};

function Circle({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const reduced = useReducedMotion() ?? false;

  return (
    <motion.div className="flex" variants={reduced ? undefined : circleMotion}>
      {/* 見た目は28px（CIRCLE）のまま、当たり判定だけ44x44pxに広げる（SPEC §9.14-14）。 */}
      <motion.button
        type="button"
        aria-label={label}
        onClick={onClick}
        whileTap={{ scale: 0.96 }}
        transition={PRESS}
        className={cn("relative grid h-11 w-11 place-items-center rounded-full", FOCUS)}
      >
        <motion.span
          aria-hidden
          whileHover={reduced ? undefined : { scale: 1.03 }}
          transition={PRESS}
          className={CIRCLE}
        >
          <svg {...ICON} width="14" height="14" stroke="currentColor" strokeWidth="3.5">
            {children}
          </svg>
        </motion.span>
      </motion.button>
    </motion.div>
  );
}

type Status = "idle" | "deleted" | "kept";

export type ConfirmRemoveButtonProps = Omit<
  ComponentProps<"div">,
  "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"
> & {
  /** トリガー（ゴミ箱アイコン）の aria-label。既存のアクセシブルネームを維持する（E2Eが使う）。 */
  label: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  /**
   * トリガー（「外す」ボタン）の DOM ノードが変わるたびに呼び出し側にも渡す。
   * 楽観的更新で行がアンマウントされてもフォーカス管理を続けられるよう、呼び出し側
   * （`BookmarkList`）がトリガーの参照を保持するために使う（Codex R8 重要3）。
   */
  onTriggerRef?: (node: HTMLButtonElement | null) => void;
};

/**
 * 栞一覧の「外す」ボタン。押すとその場で確定パネル（外す／やめる）が開き、
 * 「外す」で確定、「やめる」または Escape で取り消す。実際の削除処理（楽観的更新・
 * ロールバック）は呼び出し側が `onConfirm` の中で行う（SPEC §9.14-7）。
 *
 * 状態の読み上げ（「栞から外しました。」「そのままにしました。」）とフォーカス移動は、
 * 確定時に行自体がアンマウントされる呼び出し側（`BookmarkList`）が persistent なライブ
 * リージョンで行う（Codex R8 重要3）。このコンポーネント自身は読み上げを持たない。
 */
export function ConfirmRemoveButton({
  label,
  className,
  onConfirm,
  onCancel,
  onTriggerRef,
  ...props
}: ConfirmRemoveButtonProps) {
  const reduced = useReducedMotion() ?? false;
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const trigger = useRef<HTMLButtonElement>(null);
  const timing = (transition: Transition) => (reduced ? INSTANT : transition);

  const top = useMotionValue(WALL_TOP);
  const wall = useTransform(top, (y) => WALL_BASE - y);
  const bin = useMotionTemplate`M19 ${top}v${wall}a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V${top}`;
  const settle = useMotionValue(1);

  useEffect(() => {
    const walls = animate(
      top,
      open ? WALL_TOP_OPEN : WALL_TOP,
      reduced ? INSTANT : WALL,
    );
    return () => walls.stop();
  }, [open, reduced, top]);

  useEffect(() => {
    if (status === "idle") return;
    const nudge =
      status === "kept" && !reduced
        ? animate(settle, [1, 0.86, 1], SETTLE)
        : null;
    const done = setTimeout(() => setStatus("idle"), HOLD[status]);
    return () => {
      nudge?.stop();
      clearTimeout(done);
    };
  }, [status, reduced, settle]);

  const resolve = (next: Exclude<Status, "idle">) => {
    setOpen(false);
    setStatus(next);
    // 「やめる」（行は残る）のときだけここでトリガーへフォーカスを戻す。
    // 「外す」は行自体がアンマウントされるため、フォーカス移動は呼び出し側（BookmarkList）が行う。
    if (next === "kept") trigger.current?.focus();
    (next === "deleted" ? onConfirm : onCancel)?.();
  };

  return (
    <motion.div
      data-slot="confirm-remove-button"
      data-state={open ? "open" : "closed"}
      data-status={status}
      // SPEC motion §5.5: 紙の行の上で埋もれないよう、細線の枠（--color-line）を内側に引く（見た目のトークンだけ）
      className={cn("relative h-12 rounded-[var(--radius-md)] shadow-[inset_0_0_0_1.5px_var(--color-line)]", SURFACE, GLYPH, className)}
      animate={{ width: open ? TILE + PANEL : TILE }}
      transition={timing(WIDTH)}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) resolve("kept");
      }}
      {...props}
    >
      <motion.button
        ref={(node: HTMLButtonElement | null) => {
          trigger.current = node;
          onTriggerRef?.(node);
        }}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => {
          if (open) return resolve("kept");
          setStatus("idle");
          setOpen(true);
        }}
        // reduce でも whileTap は付けたままにする（付け外しで tabindex が変わり、サーバーの HTML と食い違うため）。
        // 動き自体は MotionConfig reducedMotion="user" が止める
        whileTap={{ scale: 0.94 }}
        transition={TAP}
        className={cn(
          "relative z-10 grid h-12 w-12 place-items-center rounded-[var(--radius-md)]",
          FOCUS,
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {status === "deleted" ? (
            <motion.svg
              key="done"
              {...ICON}
              width="20"
              height="20"
              stroke={ACCENT}
              strokeWidth="2.5"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={timing(SWAP)}
            >
              <motion.path
                d="M4 12.5 9.5 18 20 7"
                initial={reduced ? undefined : { pathLength: 0 }}
                animate={reduced ? undefined : { pathLength: 1 }}
                transition={SETTLE}
              />
            </motion.svg>
          ) : (
            <motion.svg
              key="bin"
              {...ICON}
              width="20"
              height="20"
              stroke="currentColor"
              strokeWidth="2"
              className="overflow-visible"
              style={{ scale: settle }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={timing(SWAP)}
            >
              <motion.path d={bin} />
              <motion.g
                style={{ transformBox: "view-box", transformOrigin: HINGE }}
                animate={{ rotate: open ? LID_OPEN : 0 }}
                transition={timing(LID)}
              >
                <path d="M3 6h18" />
                <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </motion.g>
            </motion.svg>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            style={{ width: PANEL }}
            className={cn(
              "absolute inset-y-0 right-0 flex items-center justify-center gap-2 rounded-[var(--radius-md)]",
              RECESS,
            )}
            variants={reduced ? undefined : panelMotion}
            initial="hidden"
            animate="shown"
            exit="hidden"
          >
            <span
              aria-hidden
              className={cn(
                "absolute -left-1.25 top-1/2 z-20 h-2.5 w-1.5 -translate-y-1/2 [clip-path:polygon(100%_0,0_50%,100%_100%)]",
                RECESS,
              )}
            />
            <Circle label="外す" onClick={() => resolve("deleted")}>
              <path d="M4 12.5 9.5 18 20 7" stroke={ACCENT} />
            </Circle>
            <Circle label="やめる" onClick={() => resolve("kept")}>
              <path d="M6 6 18 18M18 6 6 18" />
            </Circle>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default ConfirmRemoveButton;
