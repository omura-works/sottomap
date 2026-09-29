// "use client" 不要（サーバー部品からも使える）。
import type { ReactNode } from "react";
import { ViewTransition } from "@/components/motion/view-transition";

/**
 * ページの包み（SPEC motion §4.2.2）。各 `page.tsx` の返す中身をこれで包む（レイアウトに置くと出入りが起きない）。
 * 型（`transitionTypes`）が付いた遷移だけが動き、型なし（戻る・進む・`router.replace`・`refresh`）は何もしない。
 * `[data-page-root]` にはスタイルを付けない（各ページの一番外の要素の高さ・余白がそのまま効くように）。
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{ "page-forward": "page-in-forward", "page-back": "page-in-back", "lamp-iris": "page-in-iris", default: "none" }}
      exit={{ "page-forward": "page-out-forward", "page-back": "page-out-back", "lamp-iris": "page-out-iris", default: "none" }}
      default="none"
    >
      <div data-page-root="">{children}</div>
    </ViewTransition>
  );
}
