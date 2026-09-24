// モーションリファレンス「フォーカスハロー」（900ms・ease-out）。
// 選択したピンの外側に同心円の輪を1本だけ広げて消す（ピン自体は動かさない、ループしない）。
// 見た目と動きは globals.css の `.map-pin-halo`。

export const PIN_HALO_CLASS = "map-pin-halo";
/** アニメーション終了イベントが来なかった場合（タブが裏にある等）でも輪を片付けるための上限。 */
const PIN_HALO_CLEANUP_MS = 1200;

/**
 * マーカー要素に輪を1本足す。既に残っている輪は外してから足す（選択し直したら最初から1回）。
 * `reduced`（`prefers-reduced-motion: reduce`）のときは何も足さず null を返す。
 * @param color 輪の色（ピンの色の既存トークン。例: `var(--color-accent-2-600)`）
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
 * マーカーの文字グリフだけを差し替える（`textContent` の代入は子要素の輪まで消してしまうため）。
 */
export function setMarkerGlyph(markerEl: HTMLElement, glyph: string): void {
  const textNode = Array.from(markerEl.childNodes).find((node): node is Text => node.nodeType === Node.TEXT_NODE);
  if (textNode) {
    if (textNode.data !== glyph) textNode.data = glyph;
  } else {
    markerEl.insertBefore(document.createTextNode(glyph), markerEl.firstChild);
  }
}
