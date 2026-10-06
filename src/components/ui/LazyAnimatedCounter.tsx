"use client";

import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import type { AnimatedCounterProps } from "./AnimatedCounter";
import { StaticCounter } from "./StaticCounter";

type Counter = ComponentType<AnimatedCounterProps>;

let loaded: Counter | null = null;
let loading: Promise<Counter> | null = null;

function loadCounter(): Promise<Counter> {
  loading ??= import("./AnimatedCounter").then((mod) => {
    loaded = mod.AnimatedCounter;
    return mod.AnimatedCounter;
  });
  return loading;
}

/**
 * AnimatedCounter（桁が回る数字）を、必要になってから読み込む版（P7: 最初に読む JS を減らすため）。
 * - 最初は同じ HTML の `StaticCounter`（motion を読まない）を描く。サーバー描画・ハイドレーションも同じ。
 * - 数字が初めて変わったとき AnimatedCounter を読み込み、前の数字で置いてから次のフレームで新しい数字にして、
 *   今までと同じように桁を回す（読み込みの間は前の数字のまま待つ）。
 * - 別の画面ですでに読み込んであれば、描いた直後に（字を動かさずに）AnimatedCounter に替える。
 */
export function LazyAnimatedCounter(props: AnimatedCounterProps) {
  const { value } = props;
  const [Live, setLive] = useState<Counter | null>(null);
  const [failed, setFailed] = useState(false);
  // 見せ終えた数字（読み込みを待つ間は、これを出したまま待つ）
  const [base, setBase] = useState(value);
  // 読み込んだ直後の1フレーム: AnimatedCounter を前の数字で置く（次のフレームで新しい数字にして桁を回す）
  const [settling, setSettling] = useState(false);

  // すでに別の画面で読み込んであれば、ハイドレーションの後に差し替える（HTML が同じなので見た目は変わらない）
  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    void loadCounter().then((counter) => {
      if (alive) setLive(() => counter);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (Live || failed || value === base) return;
    let alive = true;
    loadCounter().then(
      (counter) => {
        if (!alive) return;
        setSettling(true);
        setLive(() => counter);
      },
      () => {
        // 読み込めなければ止まった数字で新しい値を出す（数字は必ず正しく見せる）
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [value, base, Live, failed]);

  useEffect(() => {
    if (!settling) return;
    if (typeof requestAnimationFrame !== "function") {
      const timer = setTimeout(() => setSettling(false), 0);
      return () => clearTimeout(timer);
    }
    const frame = requestAnimationFrame(() => setSettling(false));
    return () => cancelAnimationFrame(frame);
  }, [settling]);

  const following = (Live !== null && !settling) || failed;
  if (following && base !== value) setBase(value);

  const display = following ? value : base;
  if (Live) return <Live {...props} value={display} />;
  return <StaticCounter {...props} value={display} />;
}
