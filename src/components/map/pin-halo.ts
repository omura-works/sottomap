// 地図のピン（MapLibre のマーカー）の DOM と動き（SPEC motion §5.2.1）。maplibre-gl に依存しないので単体テストできる。
//
// マーカーは2層:
// - 外側 `div.map-pin-hit-area`: MapLibre が位置の transform を毎フレーム書く要素。role・tabindex・aria-label・title・
//   イベント・当たり判定の ::after・フォーカスハローだけを持ち、見た目と transform・opacity の演出は一切付けない
//   （付けると地図の位置と演出が同じ transform を奪い合い、ピンが地図からずれる）。
// - 内側 `span.pin-stamp`: 見た目（判子）と動き（押す・フェード・消える・選択の持ち上がり）。
// 栞のリボン（`span.pin-rb-box > span.pin-ribbon`）は外側に置き、判子の拡大・傾きとは別に挟まる。

import type { Quietness } from "@/lib/db/types";

export const PIN_HALO_CLASS = "map-pin-halo";
export const PIN_STAMP_CLASS = "pin-stamp";
const PIN_RIBBON_BOX_CLASS = "pin-rb-box";
/** アニメーション終了イベントが来なかった場合（タブが裏にある等）でも片付けるための上限。 */
const PIN_HALO_CLEANUP_MS = 1200;
/** 判子・フェードのクラスを外す上限（遅れ最大 720ms＋動き 480ms に余裕を足した値）。 */
const PIN_ANIM_CLEANUP_MS = 2000;
/** 判子が止まってから、インクの輪が消え終わるまで（120 + 420 − 480 = 60ms）に余裕を足した値。 */
const INK_TAIL_MS = 120;

/** 判子の字（§2.4。色だけで伝えない）。 */
export const PIN_GLYPH: Record<Quietness, string> = {
  quiet: "静",
  crowding: "並",
  touristy: "観",
};

/** 判子の地の色（フォーカスハローの輪の色。`.pin-stamp[data-q]` の --bgc と同じ）。 */
export const PIN_GROUND: Record<Quietness, string> = {
  quiet: "var(--color-accent-2-400)",
  crowding: "var(--color-accent-400)",
  touristy: "var(--color-neutral-700)",
};

/** 外側の中の判子（無ければ外側そのもの。古い1層のマーカーとの互換）。 */
export function pinStampOf(markerEl: HTMLElement): HTMLElement {
  return markerEl.querySelector<HTMLElement>(`.${PIN_STAMP_CLASS}`) ?? markerEl;
}

export interface PinElementInit {
  id: string;
  quietness: Quietness;
  /** 読み上げ・title に使う名前（例: 「シハチ鮮魚店・まだ静か」の前半）。 */
  ariaLabel: string;
  title: string;
  /** 止まったときの傾き（度）。 */
  tilt: number;
}

/** 2層のマーカー要素を作る（イベントは呼び出し側が外側に付ける）。 */
export function createPinElement(init: PinElementInit): { outer: HTMLDivElement; stamp: HTMLSpanElement } {
  const outer = document.createElement("div");
  outer.className = "map-pin-hit-area";
  outer.setAttribute("role", "button");
  outer.setAttribute("tabindex", "0");
  outer.setAttribute("aria-label", init.ariaLabel);
  outer.title = init.title;
  outer.dataset.id = init.id;
  outer.dataset.selected = "false";
  outer.dataset.bookmarked = "false";
  // 重なったときに静かな店のピンが上に来るように（.map-pin-hit-area[data-q="quiet"] の z-index）
  outer.dataset.q = init.quietness;

  const stamp = document.createElement("span");
  stamp.className = PIN_STAMP_CLASS;
  stamp.setAttribute("aria-hidden", "true");
  stamp.dataset.q = init.quietness;
  stamp.style.setProperty("--tilt", `${init.tilt}deg`);
  stamp.textContent = PIN_GLYPH[init.quietness];
  outer.appendChild(stamp);
  return { outer, stamp };
}

/**
 * マーカーに輪を1本足す。既に残っている輪は外してから足す（選択し直したら最初から1回）。
 * `reduced`（`prefers-reduced-motion: reduce`）のときは何も足さず null を返す。
 * @param color 輪の色（判子の地の色。例: `var(--color-accent-2-400)`）
 */
export function spawnPinHalo(markerEl: HTMLElement, color: string, reduced: boolean): HTMLSpanElement | null {
  removePinHalo(markerEl);
  if (reduced) return null;
  const halo = document.createElement("span");
  halo.className = PIN_HALO_CLASS;
  halo.setAttribute("aria-hidden", "true");
  halo.style.color = color;
  const cleanup = () => halo.remove();
  halo.addEventListener("animationend", cleanup, { once: true });
  setTimeout(cleanup, PIN_HALO_CLEANUP_MS);
  markerEl.appendChild(halo);
  return halo;
}

export function removePinHalo(markerEl: HTMLElement): void {
  markerEl.querySelectorAll(`.${PIN_HALO_CLASS}`).forEach((node) => node.remove());
}

/**
 * 判子の字だけを差し替える（外側の輪・リボンは消さない）。
 */
export function setMarkerGlyph(markerEl: HTMLElement, glyph: string): void {
  const stamp = pinStampOf(markerEl);
  const textNode = Array.from(stamp.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    if (textNode.data !== glyph) textNode.data = glyph;
  } else {
    stamp.insertBefore(document.createTextNode(glyph), stamp.firstChild);
  }
}

/**
 * 判子を待っている間（透明）のピンは、押せず・Tab でも入れず・読み上げにも出さない（inert）。押し始めたら戻す。
 */
export function setPinWaiting(markerEl: HTMLElement, waiting: boolean): void {
  markerEl.inert = waiting;
  const stamp = pinStampOf(markerEl);
  if (waiting) stamp.classList.add("is-waiting");
}

export type PinEntrance = "stamp" | "fade";

/** 判子ごとの、動いている入場の後片付け。 */
const entranceCleanups = new WeakMap<HTMLElement, () => void>();

/**
 * 判子を1回押す（"stamp"）か、フェードで出す（"fade"）。終わったらクラスを外す
 * （残すと、止まった後の選択の `scale` を animation の最終値が上書きしてしまう）。
 * @param ink インクの輪を付けるか（最初の3つの「静」だけ）
 */
export function playPinEntrance(stamp: HTMLElement, entrance: PinEntrance, delayMs: number, ink = false): void {
  // 前の入場の後片付け（タイマー・リスナー）を先に外す（続けて押し直したときに、前の終わりで今のクラスを外さないように）
  entranceCleanups.get(stamp)?.();
  stamp.classList.remove("is-waiting", "is-stamping", "is-fading", "is-leaving", "has-ink");
  // 同じクラスを付け直しても再生し直すように、1回スタイルを確定させる
  void stamp.offsetWidth;
  stamp.style.setProperty("--d", `${Math.round(delayMs)}ms`);
  const mainName = entrance === "stamp" ? "v-stamp" : "v-fade-in";
  stamp.classList.add(entrance === "stamp" ? "is-stamping" : "is-fading");
  if (entrance === "stamp" && ink) stamp.classList.add("has-ink");

  let inkTimer: number | undefined;
  const detach = () => {
    window.clearTimeout(timer);
    window.clearTimeout(inkTimer);
    stamp.removeEventListener("animationend", onEnd);
    entranceCleanups.delete(stamp);
  };
  const clear = () => {
    window.clearTimeout(timer);
    stamp.removeEventListener("animationend", onEnd);
    stamp.classList.remove("is-stamping", "is-fading");
    // インクの輪は判子より 60ms 遅く終わる（押して 120ms 後から 420ms）ので、少し待ってから外す
    if (stamp.classList.contains("has-ink")) {
      inkTimer = window.setTimeout(() => {
        stamp.classList.remove("has-ink");
        entranceCleanups.delete(stamp);
      }, INK_TAIL_MS);
    } else {
      entranceCleanups.delete(stamp);
    }
  };
  const onEnd = (event: AnimationEvent) => {
    if (event.target !== stamp || event.pseudoElement) return;
    if (event.animationName === mainName) clear();
  };
  const timer = window.setTimeout(clear, delayMs + PIN_ANIM_CLEANUP_MS);
  stamp.addEventListener("animationend", onEnd);
  entranceCleanups.set(stamp, detach);
}

/**
 * 栞のリボンを付ける・外す。`entrance` が "tuck" なら上から挟まり（止まった後に1回ゆれる）、"fade" ならフェード、
 * "wait" なら判子を待つ間は隠れたまま、"none" なら挟まった状態で出す。
 */
export function setPinRibbon(
  markerEl: HTMLElement,
  bookmarked: boolean,
  entrance: "tuck" | "fade" | "wait" | "none" = "none",
  delayMs = 0,
): void {
  markerEl.dataset.bookmarked = bookmarked ? "true" : "false";
  let box = markerEl.querySelector<HTMLSpanElement>(`.${PIN_RIBBON_BOX_CLASS}`);
  if (!bookmarked) {
    box?.remove();
    return;
  }
  if (!box) {
    box = document.createElement("span");
    box.className = PIN_RIBBON_BOX_CLASS;
    box.setAttribute("aria-hidden", "true");
    const ribbon = document.createElement("span");
    ribbon.className = "ribbon pin-ribbon";
    box.appendChild(ribbon);
    markerEl.appendChild(box);
  } else if (entrance === "none") {
    return;
  }
  const ribbon = box.firstElementChild as HTMLElement;
  ribbon.classList.remove("is-waiting", "verb-tuck", "is-fading");
  void ribbon.offsetWidth;
  ribbon.style.setProperty("--d", `${Math.round(delayMs)}ms`);
  if (entrance === "tuck") ribbon.classList.add("verb-tuck");
  else if (entrance === "fade") ribbon.classList.add("is-fading");
  else if (entrance === "wait") ribbon.classList.add("is-waiting");
}

/**
 * 消えるピン: 外側はすぐに読み上げ・フォーカス・当たり判定から外し、内側だけが縮んで消える。
 * `onDone` は 180ms 後（reduce なら即座）に呼ぶ（呼び出し側が `marker.remove()` する）。
 * 戻す関数を返す（消え切る前に同じピンが戻ってきたとき用）。
 */
export function leavePin(markerEl: HTMLElement, reduced: boolean, onDone: () => void): () => void {
  markerEl.setAttribute("aria-hidden", "true");
  markerEl.setAttribute("tabindex", "-1");
  markerEl.style.pointerEvents = "none";
  removePinHalo(markerEl);
  if (reduced) {
    onDone();
    return () => {};
  }
  const stamp = pinStampOf(markerEl);
  entranceCleanups.get(stamp)?.();
  stamp.classList.remove("is-waiting", "is-stamping", "is-fading", "has-ink");
  stamp.classList.add("is-leaving");
  const timer = window.setTimeout(onDone, 180);
  return () => {
    window.clearTimeout(timer);
    stamp.classList.remove("is-leaving");
    markerEl.removeAttribute("aria-hidden");
    markerEl.setAttribute("tabindex", "0");
    markerEl.style.pointerEvents = "";
  };
}

/** `sessionStorage` の `sotto:stamped:{key}`（読めない・書けないときは毎回判子。例外を外へ出さない）。 */
export function hasStamped(key: string | undefined): boolean {
  if (!key) return false;
  try {
    return window.sessionStorage.getItem(`sotto:stamped:${key}`) === "1";
  } catch {
    return false;
  }
}

export function markStamped(key: string | undefined): void {
  if (!key) return;
  try {
    window.sessionStorage.setItem(`sotto:stamped:${key}`, "1");
  } catch {
    // 保存できなくても次も判子で出るだけ
  }
}

const PIN_TETHER_CLASS = "pin-tether";

/**
 * 重なったピンを表示のためだけにずらす（`pin-spread.ts` の計算結果）。外側（MapLibre が位置を書く要素）は動かさず、
 * CSS の `--sx`/`--sy` で内側（判子・当たり判定・リボン・輪）だけを `translate` で動かす。
 * ずらしたときは、本当の位置に小さな点（外側の `::before`）を残し、点と判子を細い線（`.pin-tether`）でつなぐ。
 * `offset` が null（重なっていない）なら元へ戻す。
 */
export function setPinSpread(markerEl: HTMLElement, offset: { dx: number; dy: number } | null): void {
  const dx = offset ? Math.round(offset.dx * 10) / 10 : 0;
  const dy = offset ? Math.round(offset.dy * 10) / 10 : 0;
  const spread = Math.hypot(dx, dy) >= 0.5;
  markerEl.style.setProperty("--sx", `${spread ? dx : 0}px`);
  markerEl.style.setProperty("--sy", `${spread ? dy : 0}px`);
  let tether = markerEl.querySelector<HTMLSpanElement>(`.${PIN_TETHER_CLASS}`);
  if (!spread) {
    delete markerEl.dataset.spread;
    return;
  }
  markerEl.dataset.spread = "true";
  if (!tether) {
    tether = document.createElement("span");
    tether.className = PIN_TETHER_CLASS;
    tether.setAttribute("aria-hidden", "true");
    // 判子・リボンより下に描く
    markerEl.insertBefore(tether, markerEl.firstChild);
  }
  tether.style.width = `${Math.hypot(dx, dy).toFixed(1)}px`;
  tether.style.rotate = `${((Math.atan2(dy, dx) * 180) / Math.PI).toFixed(1)}deg`;
}
