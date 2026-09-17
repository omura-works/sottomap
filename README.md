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

- `NEXT_PUBLIC_SITE_URL` はログイン用メールのリンクの戻り先（`/auth/callback`）の origin に使います。リクエストヘッダー（`Host` / `X-Forwarded-Host`）は使いません。未設定だとログイン用メールを送る時点で例外になります。本番（`VERCEL_ENV=production` または `NODE_ENV=production`）では `https://` の URL だけを受け付けます。本番以外で `http://` を使えるのは `localhost` / `127.0.0.1` / `[::1]` だけです。Supabase の Authentication → URL Configuration の Redirect URLs にも `https://YOUR_DOMAIN/auth/callback` を登録してください。
- `SUPABASE_SERVICE_ROLE_KEY` は cron（`/api/cron/verification`）だけが使う秘密鍵です。承認・確認・投稿は、利用者本人のセッションで DB 関数（`create_spot` / `endorse_spot` / `answer_verification`）を呼びます。ブラウザへ公開せず、VercelでもServer-sideの環境変数として設定してください。

DBは `supabase/migrations/` のSQLを番号順（`0001` → `0006`）に適用してから、`supabase/seed.sql` を投入します。

`0006_security_hardening.sql` は、利用者からの直接の書き込み（スポットの状態、承認、確認、確認依頼、灯りポイント）を取り上げ、DB 関数に集約します。あわせて、public スキーマの表・ビュー・関数の権限を既定権限に頼らず明示し（anon / authenticated から一度すべて取り上げて必要なものだけ付け直す）、DB 関数を `search_path = ''` とスキーマ修飾で固定します。適用後は、0005 以前のアプリ（テーブルへ直接書き込む版）からの承認・確認・投稿は権限エラーになるため、アプリのデプロイと同時に適用してください。

- **0006 は空のDB（新規プロジェクト）に適用する前提です。** 既にデータがある DB に適用する場合は、適用の前後で次を監査し、必要なら調整してください。0006 は既存データの整合性を保証しません。
  - ポイント残高: `users.lantern_points` が、公開（+10）と確認（+5）の実績から説明できるか。0006 で作る台帳 `lantern_events` には既存の加算が記録されないため、以後の二重加算防止の前提がずれないよう、台帳の補完または残高の補正が必要です。
  - 確認履歴: `verifications` に、確認依頼を経由しない行や捏造された行が無いか（`verification_request_id` が NULL の行）。
  - 承認時刻: `endorsements.created_at` が利用者に指定された値でないか。pending の期限判定（`created_at + 30日`）に使います。
- 0006 は `alter default privileges for role postgres` で、今後 postgres が作るオブジェクトに anon / authenticated への既定権限が付かないようにします（関数の PUBLIC への EXECUTE は全スキーマ分）。マイグレーションを実行するロールがこれを変更できない環境では警告を出して続行します。その場合も、0006 が明示した GRANT / REVOKE は有効です。

### 実DBでの検証（本番公開前に必須）

RLS・権限表・DB 関数・同時実行は、ローカルの Supabase で pgTAP テスト（`supabase/tests/*.sql`）を流して確かめます。**本番公開の前に必ず実行してください。**

1. Docker Desktop を起動する（Supabase CLI は devDependencies に入っています）
2. `npx supabase start`
3. `npx supabase db reset`（migrations 0001〜0006 と seed を適用）
4. `npx supabase test db`

- `0006_security.sql` は権限表（匿名・投稿者・同じ街・別の街・service_role）と DB 関数の規則を1接続で検査し、最後に rollback します。
- `0006_concurrency.sql` は `dblink` 拡張で自分自身の DB に2接続を張り、cron と回答の交差（旧実装で起きた循環待ち）、同じ依頼への同時回答、期限直前の承認と cron、同時承認を検査します。別接続から見えるようテストデータはコミットし、最後に削除します。cron は DB 全体を処理するので、seed のデータにも期限処理が反映されます（元に戻すには `npx supabase db reset`）。
  - 各シナリオは、後から送った問い合わせが先の接続にブロックされてロック待ちに入ったこと（`pg_locks` の `granted = false`・`pg_blocking_pids`・`pg_stat_activity` の `wait_event_type = 'Lock'`）を最大10秒ポーリングで確かめてから、先の接続をコミットします。確かめられなければテストが失敗します。
  - 期限境界のシナリオは、期限を「承認側トランザクションの開始時刻 + 2秒」に置き、DB の時計がそれを過ぎるまで待ちます（約2.5秒）。
  - 接続文字列の既定は `host=<inet_server_addr()> port=<DBのport> dbname=<現在のDB> user=postgres password=postgres`（Supabase のローカル既定）です。postgres は非スーパーユーザーのため dblink はパスワード認証の接続しか使えず、ローカルの Supabase コンテナでは 127.0.0.1 が trust 認証になるので、セッションのサーバー側アドレス（`inet_server_addr()`。取れない・ループバックの場合だけ 127.0.0.1）へ接続します。違う場合は `alter database postgres set urasupo.test_dblink_connstr = '...';` で上書きしてください。
- 2026-09-17 時点で、ローカル Supabase で `npx supabase db reset` → `npx supabase test db` を3回連続で実行し、すべて通過しています（`0006_security.sql` 66件・`0006_concurrency.sql` 28件）。

### 実DBでのログイン済みE2E（ローカル専用）

ローカル Supabase に接続した開発サーバーへ、Mailpit に届いたログイン用メールのリンクでログインし、`/start` での居住街の保存 → `/me` → 店の詳細で栞に挟む → `/bookmarks` → 確認依頼への回答 → 確認切れ（dormant）の店の復帰（「地図に戻りました。」と公開一覧への復帰）までを通します。通常の `npx playwright test`（デモモード）には含まれません。

1. `npx supabase start`（起動済みならそのまま）
2. `npx supabase db reset`（seed の状態にする）
3. `npm run test:e2e:realdb`
4. `npx supabase db reset`（テストが書き換えたデータを seed に戻す）

- 設定は `playwright.realdb.config.ts`、テストは `e2e-realdb/` にあります。URL・anon key・service_role key は `npx supabase status -o env` から読み、`URASUPO_DEMO_MODE` なし・`NEXT_PUBLIC_SITE_URL=http://localhost:3200` で `next dev` を 3200 番で起動します（3200 番を空けておいてください）。
- ログインする利用者は seed の Rさん（`demo-r@example.invalid`）です。seed の `auth.users` はトークン列を空文字で入れてあり、Supabase Auth でメールログインできます。確認切れの店と missed の依頼は、テストの中で service_role key を使って作ります。
- ログイン用メールの戻り先 `http://localhost:3200/**` は `supabase/config.toml` の `additional_redirect_urls` に入れてありますが、反映には `npx supabase stop` → `npx supabase start` が必要です。反映前は Supabase Auth が `site_url` へ戻すため、テストは確認リンクの戻り先からコードを取り出し、アプリの `/auth/callback` へ渡します。

## テスト

```bash
npm run build
npm run lint
npx vitest run
npx playwright test
```

- Vitest は `vitest.config.ts` で `URASUPO_DEMO_MODE=1` を渡し、フィクスチャ経路で動きます。フィクスチャ経路には DB 関数と同じ規則（回答できる時点、同じ依頼の二重受理の禁止、pending の期限、ポイント台帳）を実装してあり、その規則を検証します。
- Playwright は `URASUPO_DEMO_MODE=1` で開発サーバー（`next dev`）を起動し、実際の画面導線を検証します。ブラウザの導入はPlaywrightの案内に従って別途行ってください。
- `supabase/tests/*.sql` は RLS・権限表・DB 関数・同時実行を確かめる pgTAP テストです。手順と実行結果は上の「実DBでの検証」を参照してください。
- `npm run test:e2e:realdb` は実DBに接続したログイン済みの導線を確かめる E2E です（ローカル専用）。手順は上の「実DBでのログイン済みE2E」を参照してください。

## 既知の制約

- 街の地図・一覧（`listSpots`）は、その街の公開スポットを全件取得してから、アプリ側で距離順に並べて件数を絞っています。1街あたり数百件までを想定した実装です。これを超える規模になったら、距離順と件数制限を PostGIS の DB 関数（RPC）に移してください。

## Vercel Cron

`vercel.json` は `/api/cron/verification` を毎日 `0 18 * * *`（UTC）に呼び出します。Vercelの環境変数に `CRON_SECRET` を設定してください。APIは `Authorization: Bearer <CRON_SECRET>` が一致しない呼び出し（`CRON_SECRET` が未設定・空の場合を含む）を `401` で拒否します。比較は SHA-256 で固定長にしたうえでの定数時間比較です。DB 関数 `run_verification_cron` は、回答・承認がロック中のスポットを待たずに次回へ回し（結果の `skippedLockedCount`）、API はデッドロック（`40P01`）・直列化失敗（`40001`）のときだけ1回再実行します。
