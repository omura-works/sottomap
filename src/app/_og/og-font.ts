import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * OG 画像（src/app/opengraph-image.tsx）で使う書体。サイトの書体（layout.tsx の next/font）と同じものにする。
 * 書体を変えるときは、layout.tsx の next/font と、ここ（名前・ファイル）と、同じフォルダのフォントファイル・
 * ライセンス文を差し替えるだけでよい。
 *
 * ネットワークには取りに行かない（Codex R27 重要: 取得に失敗すると既定の書体に日本語の字形が無く、
 * 全部□になった画像がビルドで固定されていた）。フォントはリポジトリに同梱する（SIL OFL 1.1、OFL.txt を同梱）。
 * ファイルは1つの太さ（400）だけ。OG 画像のロゴと見出しはどちらも 400 で描く（同梱サイズを抑えるため）。
 */
export const OG_FONT_NAME = "Zen Maru Gothic";
export const OG_FONT_FILE = "ZenMaruGothic-Regular.ttf";
export const OG_FONT_WEIGHT = 400;

export type OgFont = { name: string; data: ArrayBuffer; weight: typeof OG_FONT_WEIGHT; style: "normal" };

/** 同梱のフォントファイルを読む。読めなければ例外（日本語が□の画像を黙って作らない）。 */
export async function loadOgFont(): Promise<OgFont> {
  const buffer = await readFile(join(process.cwd(), "src", "app", "_og", OG_FONT_FILE));
  const data = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  return { name: OG_FONT_NAME, data, weight: OG_FONT_WEIGHT, style: "normal" };
}
