/**
 * 画面の外の節を、最初の描画の直後に描く（SPEC motion §7.1 の /start の予算）。
 *
 * Web フォントが届く前の最初のレイアウトは、日本語の字ごとに書体を探すので重い。/start の画面の外の節
 * （`.start-trail`）まで最初のレイアウトに入れると最初の表示（LCP）が遅れるため、`<head>` のこの小さな
 * インラインスクリプトが `<html>` に `data-defer-below` を付け、その間だけ CSS で `content-visibility: hidden`
 * にする（`contain-intrinsic-size` で高さは取っておくので CLS は増えない）。
 *
 * 印を付けるのは /start だけ（ほかの画面には遅らせる節が無い）。
 * 外すのは次のうち早い方（React・ハイドレーション・JS 本体の読み込みとは無関係に動く）:
 * - 最初の描画（first-contentful-paint）を見届けた直後の次のフレーム
 * - 保険のタイマー（描画が始まる最初のフレームから 1500ms。CPU が遅い端末では文書の解析の終わりから数えると
 *   最初の描画より先に切れてしまい、遅らせる意味がなくなるため）
 * JS が無効ならこのスクリプトも動かないので、最初から見える（読み上げ・検索でも読める）。
 *
 * CSP: script-src は今 'unsafe-inline' を許していて、このスクリプトはそれで動く。ハッシュ（sha256）を
 * script-src に足すと、ブラウザは 'unsafe-inline' を無視するようになり Next.js 自身のインラインスクリプトが
 * 止まるので、nonce/ハッシュ方式へ移るときにまとめて足す（`DEFER_BELOW_SCRIPT` の sha256 を使う）。
 */
export const DEFER_BELOW_ATTRIBUTE = "data-defer-below";
export const DEFER_BELOW_SAFETY_MS = 1500;

export const DEFER_BELOW_SCRIPT = `(function(){if(location.pathname!=="/start")return;var d=document.documentElement,a="${DEFER_BELOW_ATTRIBUTE}",done=false;function show(){if(done)return;done=true;d.removeAttribute(a);}d.setAttribute(a,"");try{if(performance.getEntriesByName("first-contentful-paint").length){requestAnimationFrame(show);}else if(window.PerformanceObserver&&PerformanceObserver.supportedEntryTypes&&PerformanceObserver.supportedEntryTypes.indexOf("paint")>=0){var o=new PerformanceObserver(function(l){if(l.getEntriesByName("first-contentful-paint").length){o.disconnect();requestAnimationFrame(show);}});o.observe({type:"paint",buffered:true});}else{requestAnimationFrame(function(){requestAnimationFrame(show);});}}catch(e){show();return;}requestAnimationFrame(function(){setTimeout(show,${DEFER_BELOW_SAFETY_MS});});})();`;
