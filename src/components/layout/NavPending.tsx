"use client";

import { useLinkStatus } from "next/link";

/**
 * ページ移動の待ち（SPEC motion §4.1.1）。`<Link>` の子の中に置き、移動中（pending）の間だけ、
 * そのタブの丸に呼吸する輪を出す。輪は 400ms 待ってから出る（すぐ終わる移動では何も見えない）。最大4周。
 * 飾りなので読み上げない（移動の読み上げはブラウザと次のページに任せる）。
 */
export function NavPending() {
  const { pending } = useLinkStatus();
  return <span className="nav-pending" data-pending={pending ? "true" : "false"} aria-hidden="true" />;
}
