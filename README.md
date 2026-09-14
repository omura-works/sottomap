# ウラスポ

ウラスポは、北海道の「まだ静かな店」を地元の人が地図に残すWebアプリです。投稿したピンは同じ街の2人の承認で公開され、投稿者が90日ごとに静けさを確認することで、観光情報だけでは見つけにくい場所を地域の手で保ちます。

## デモモードで起動する

Node.js と npm を用意し、`.env.local` に次の1行を書いてから起動します。

```dotenv
URASUPO_DEMO_MODE=1
```

```bash
npm install
npm run dev
```

デモモードは `URASUPO_DEMO_MODE=1` を**明示したときだけ**有効になり、インメモリのフィクスチャと固定のデモユーザーを使います。画面上の操作はサーバーを再起動すると元に戻り、永続保存されません。`predev`（および `prebuild`）では MapLibre の地図Workerと共有モジュールが `public/maplibre/` に配置されます。

- 本番（`VERCEL_ENV=production` または `NODE_ENV=production`）で `URASUPO_DEMO_MODE=1` が指定されていると、起動時に例外になります。`next build` / `next start` も `NODE_ENV=production` で動くため、デモモードは `next dev` とテストでだけ使えます。
- Supabase の環境変数が一部だけ（URL か anon key の片方）設定されていると例外になります。足りないからといってデモモードには切り替わりません。
- デモモードを指定せず、Supabase の環境変数も無い場合も例外になります。

## Supabaseを使う

`.env.local`（Vercel では環境変数）に次を設定します。

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_SITE_URL=https://YOUR_DOMAIN
CRON_SECRET=十分に長いランダムな値
```

- `NEXT_PUBLIC_SITE_URL` はログイン用メールのリンクの戻り先（`/auth/callback`）の origin に使います。リクエストヘッダー（`Host` / `X-Forwarded-Host`）は使いません。未設定だとログイン用メールを送る時点で例外になります。Supabase の Authentication → URL Configuration の Redirect URLs にも `https://YOUR_DOMAIN/auth/callback` を登録してください。
- `SUPABASE_SERVICE_ROLE_KEY` は cron（`/api/cron/verification`）だけが使う秘密鍵です。承認・確認・投稿は、利用者本人のセッションで DB 関数（`create_spot` / `endorse_spot` / `answer_verification`）を呼びます。ブラウザへ公開せず、VercelでもServer-sideの環境変数として設定してください。

DBは `supabase/migrations/` のSQLを番号順（`0001` → `0006`）に適用してから、`supabase/seed.sql` を投入します。既存環境では未適用のマイグレーションだけを順に適用してください。

`0006_security_hardening.sql` は、利用者からの直接の書き込み（スポットの状態、承認、確認、確認依頼、灯りポイント）を取り上げ、DB 関数に集約します。適用後は、0005 以前のアプリ（テーブルへ直接書き込む版）からの承認・確認・投稿は権限エラーになるため、アプリのデプロイと同時に適用してください。

## テスト

```bash
npm run build
npm run lint
npx vitest run
npx playwright test
```

- Vitest は `vitest.config.ts` で `URASUPO_DEMO_MODE=1` を渡し、フィクスチャ経路で動きます。フィクスチャ経路には DB 関数と同じ規則（回答できる時点、同じ依頼の二重受理の禁止、pending の期限、ポイント台帳）を実装してあり、その規則を検証します。
- Playwright は `URASUPO_DEMO_MODE=1` で開発サーバー（`next dev`）を起動し、実際の画面導線を検証します。ブラウザの導入はPlaywrightの案内に従って別途行ってください。
- `supabase/tests/*.sql` は RLS と DB 関数の権限表を確かめる pgTAP テストです。実行には Docker と Supabase CLI が必要です（`supabase start` → `supabase db reset` → `supabase test db`）。**このリポジトリの開発環境には PostgreSQL が無いため、まだ一度も実行していません。**

## Vercel Cron

`vercel.json` は `/api/cron/verification` を毎日 `0 18 * * *`（UTC）に呼び出します。Vercelの環境変数に `CRON_SECRET` を設定してください。APIは `Authorization: Bearer <CRON_SECRET>` が一致しない呼び出し（`CRON_SECRET` が未設定・空の場合を含む）を `401` で拒否します。比較は SHA-256 で固定長にしたうえでの定数時間比較です。
