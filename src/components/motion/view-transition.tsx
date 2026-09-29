// "use client" を付けない（サーバー部品からも使う）。
import * as React from "react";
import type { ViewTransitionProps } from "react";

/**
 * Next の App Router が使う React（canary）には `ViewTransition` があるが、単体テストが読む
 * `node_modules/react`（安定版）には無い。`import { ViewTransition } from "react"` を直接書くと
 * テストで「Element type is invalid」になるため、どこでもこの包みから import する（SPEC motion §4.2）。
 */
const Native = (React as unknown as { ViewTransition?: React.ComponentType<ViewTransitionProps> }).ViewTransition;

/** React の <ViewTransition>。無い環境（単体テスト・古い React）では子をそのまま返す。 */
export function ViewTransition(props: ViewTransitionProps) {
  return Native ? <Native {...props} /> : <>{props.children}</>;
}
