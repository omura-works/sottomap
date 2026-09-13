# ウラスポ

ウラスポは、北海道の「まだ静かな店」を地元の人が地図に残すWebアプリです。投稿したピンは同じ街の2人の承認で公開され、投稿者が90日ごとに静けさを確認することで、観光情報だけでは見つけにくい場所を地域の手で保ちます。

## デモモードで起動する

Node.js と npm を用意し、環境変数を設定せずに次を実行します。

```bash
npm install
npm run dev
```

Supabaseの接続情報が無い場合は自動的にデモモードとなり、インメモリのフィクスチャを使います。画面上の操作はサーバーを再起動すると元に戻り、永続保存されません。`predev`（および `prebuild`）では MapLibre の地図Workerと共有モジュールが `public/maplibre/` に配置されます。

## Supabaseを使う

`.env.local` に次を設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
CRON_SECRET=十分に長いランダムな値
```

`SUPABASE_SERVICE_ROLE_KEY` は承認・確認・cronのサーバー処理だけで使う秘密鍵です。ブラウザへ公開せず、VercelでもServer-sideの環境変数として設定してください。

DBは `supabase/migrations/` のSQLを番号順（`0001` → `0005`）に適用してから、`supabase/seed.sql` を投入します。既存環境では未適用のマイグレーションだけを順に適用してください。

## テスト

```bash
npm run build
npm run lint
npx vitest run
npx playwright test
```

Playwrightは環境変数なしのデモモードで開発サーバーを起動し、実際の画面導線を検証します。ブラウザの導入はPlaywrightの案内に従って別途行ってください。

## Vercel Cron

`vercel.json` は `/api/cron/verification` を毎日 `0 18 * * *`（UTC）に呼び出します。Vercelの環境変数に `CRON_SECRET` を設定してください。APIは `Authorization: Bearer <CRON_SECRET>` が一致しない呼び出しを `401` で拒否します。
