// MapLibre GL JS v6 の Web Worker を public/ に配置する。
//
// MapLibre v6 は Worker の場所を実行時に自分自身の import.meta.url から文字列で組み立てる
// （`new URL(\`./${name}\`, import.meta.url)`）。この書き方はバンドラーが静的に検出できないため、
// Turbopack は Worker ファイルを配信せず、取得が 404 → 地図のタイルもピンも出なくなる。
// そこで Worker 本体と、それが相対 import する shared モジュールを同じディレクトリに置き、
// MapCanvas から maplibregl.setWorkerUrl() で明示的に指す。
//
// predev / prebuild から実行するので、node_modules の版と常に一致する。
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "maplibre-gl", "dist");
const dest = join(root, "public", "maplibre");

mkdirSync(dest, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(src, file), join(dest, file));
}
console.log(`[maplibre] worker を ${dest} に配置しました`);
