# 本番公開手順（Vercel + Supabase / ドメイン urasupo.jp）

この手順書は、利用者本人が上から順に実行することを想定しています。**このリポジトリの自動化（Claude Code
などのエージェント）は、アカウント作成・ログイン・APIキーやパスワードの入力・実際のデプロイ・本番DBへの
適用を行いません。** これらはすべて本人の操作です。

前提として、`npm run build` / `npm run lint` / `npx vitest run` がローカルで通っていること、
`docs/SPEC.md` §9.13 の安全性の裁定（DB関数経由の書き込み・デモモードの扱い・`NEXT_PUBLIC_SITE_URL`
の https 必須など）を理解していることを確認してください。

Vercel・Supabase の管理画面のメニュー名・項目名は、両サービスの更新頻度が高く、この文書の作成時点
（2026年9月）の一般的な構成に基づいています。実際の画面と項目名が異なる場合は、各サービスの公式ドキュメント
を優先してください。2026年9月18日に Vercel・Supabase の公式ドキュメントで主要な項目（Cron の認可ヘッダー、
Hobby プランの Cron 制約、`db push` のオプション、URL 設定・メールテンプレート・SMTP の画面、Sensitive 環境変数）を
確認済みです。

---

## 0. 事前準備

- [ ] `urasupo.jp` ドメインのDNSを管理できること（レジストラ or DNSサービスの管理画面にアクセスできる）
- [ ] Vercel アカウント（本人が作成）
- [ ] Supabase アカウント（本人が作成）
- [ ] このリポジトリを GitHub 等のVercelが連携できるリポジトリホスティングに置いていること

---

## 1. Supabase 本番プロジェクトの作成

1. Supabase ダッシュボードで新規プロジェクトを作成する。
   - **リージョンは `ap-northeast-1`（東京）を推奨**（利用者が北海道在住想定のため、日本国内リージョンで
     レイテンシを抑える）。
   - プロジェクトのデータベースパスワードは十分に長いランダムな値にし、パスワードマネージャー等に保管する
     （このパスワードは `.env` には使わない。CLI連携時に一度だけ使う）。
2. ローカルにインストール済みの Supabase CLI（このリポジトリの devDependencies）でプロジェクトを紐付ける。

   ```bash
   npx supabase login
   npx supabase link --project-ref <本番プロジェクトのref>
   ```

   `login` はブラウザでの認証が必要です。**本人が実行してください。**
3. マイグレーションを本番へ適用する。`supabase/migrations/` の全ファイルを**番号順に**適用します
   （個別の番号を指定しない。追加のマイグレーションが増えていても同じコマンドで対応できます）。

   ```bash
   npx supabase db push
   ```

   - `db push` は `supabase/migrations/` にある未適用のマイグレーションを、ファイル名の番号順に本番へ適用します。
   - 実行前に `npx supabase db push --dry-run` で、適用されるマイグレーションの一覧を確認してください（適用はされません）。
   - `db push` は既定ではシードを流しません（`--include-seed` を付けたときだけ流れる）。**本番では `--include-seed` を付けないこと**（6節の初期データの扱いを参照）。
4. **pgTAP テスト（`supabase/tests/*.sql`）は本番プロジェクトに流さないこと。**
   `npx supabase test db` はローカルのSupabase（`npx supabase start` で起動したコンテナ）専用です。
   テストの中には確認依頼を作成・削除する副作用があり、本番データを汚します。本番の動作確認は
   本手順の「5. 公開直後の確認チェックリスト」で行います。

---

## 2. 認証設定（Supabase ダッシュボード）

Authentication → URL Configuration（`https://supabase.com/dashboard/project/<プロジェクトID>/auth/url-configuration`）で以下を設定します。

- **Site URL**: `https://urasupo.jp`
- **Redirect URLs**（許可リスト。ワイルドカード `**` が使えます）:
  - `https://urasupo.jp/**`
  - Vercel のPreview環境も使う場合は、Preview用のURL（例: `https://urasupo-*.vercel.app/**`）も追加する
    （Preview環境の扱いは §4 を参照。本番公開の直後は追加しなくても問題ありません）。

### メールテンプレートの日本語化（5種）

ローカルは `supabase/config.toml` の `content_path` でファイルを直接参照できますが、**本番の
Supabaseプロジェクトではこの設定はダッシュボード側に反映されません。** Authentication → Email Templates
（`https://supabase.com/dashboard/project/<プロジェクトID>/auth/templates`）から、テンプレートごとに件名と本文を手動で貼り付けてください。

| テンプレート | 件名（そのままコピー） | 本文ファイル |
| --- | --- | --- |
| Magic link or OTP | ウラスポにログインする | `supabase/templates/magic_link.html` |
| Confirm sign up | ウラスポのメールアドレスを確認する | `supabase/templates/confirmation.html` |
| Change email address | ウラスポのメールアドレス変更を確認する | `supabase/templates/email_change.html` |
| Reauthentication | ウラスポの確認コード | `supabase/templates/reauthentication.html` |
| Invite user | ウラスポにご招待します | `supabase/templates/invite.html` |

各 `.html` ファイルの中身をテキストエディタで開き、本文欄にそのまま貼り付けてください。色はデザイン
トークンの値を直書きしているため、`src/app/globals.css` のトークンを本番前に変更した場合はメールの
HTMLも合わせて直してください。

### SMTP（メール配信）

**独自SMTPの設定は必須です。** Supabase 組み込みのメール配信は、プロジェクトのチームメンバーのアドレスにしか
届かず、送信数も1時間あたり2通までです（2026年9月時点の公式ドキュメント）。独自SMTPを設定しないと、一般の利用者には
ログインメールが一通も届きません。Authentication → SMTP Settings（`https://supabase.com/dashboard/project/<プロジェクトID>/auth/smtp`）
で独自のSMTP（例: Resend、SendGrid、Amazon SES など）を設定してください。設定後も送信数の上限（Rate Limits）を
確認し、想定する利用者数に足りるよう調整してください。

- 送信元アドレス・送信者名は、利用者が届いたメールを見て「ウラスポ」と分かるものにしてください。
- SMTPのAPIキー・パスワードは、Supabaseダッシュボードにのみ入力し、このリポジトリのどこにも
  コミットしないでください。

---

## 3. 初期データの投入

`supabase/seed.sql` は**本番に投入してはいけません。** このファイルは以下を含みます。

- **本番に入れてよい可能性がある部分**: `cities`（街8件・実在の北海道の自治体名）、`tags`（タグの
  定義）、`badges`（バッジの定義）。これらはアプリの設定データで、実在の店・利用者の個人情報は
  含みません。
- **本番に入れてはいけない部分**: `auth.users` / `users`（架空のデモユーザー10件）、`spots`（架空の
  確認履歴・承認・静けさステータスを持つ店舗データ。店名・住所自体は実在店舗の公開情報だが、確認人数
  や承認履歴はゲーム上のデモデータ）、`endorsements`、`verifications`、`verification_requests`、
  `bookmarks`。これらは `README.md` の「実データ方針」注記のとおりアーキテクチャ実演用の架空データ
  であり、実店舗の事実の主張として公開してはいけません。

投入方法（本番で使う場合）:

1. `supabase/seed.sql` を直接 `db push` や `psql` で流さない。
2. `cities` / `tags` / `badges` の `insert` 文だけを別ファイル（例: `supabase/seed.production.sql`、
   このリポジトリには未作成）に抜き出してレビューし、本人が内容を確認したうえで
   Supabase ダッシュボードの SQL Editor に貼り付けて実行する。
3. 実店舗のデータ（`spots` 相当）を本番に載せる場合は、実際の投稿フロー（`create_spot` DB関数経由、
   §9.13.2）で、実在の利用者が居住街を確認した上で投稿し、同じ街の2人の承認を経て公開する運用に
   乗せてください。シードとして直接INSERTしない。

---

## 4. Vercel の設定

### 4.1 リポジトリ連携

1. Vercel で「Add New Project」からこのリポジトリを選択し、Framework Preset は Next.js
   （自動検出されるはず）。
2. Build Command / Output は既定（`next build`）のままで問題ありません。
   `predev` / `prebuild`（`scripts/copy-maplibre-worker.mjs`）は `npm run build` 実行時に
   `prebuild` として自動的に走ります。

### 4.2 環境変数（Vercel Project Settings → Environment Variables）

`.env.example` の全変数について、Production と Preview を分けて設定します（値はここには書きません。
本人がVercelダッシュボードに直接入力してください）。

| 変数 | Production | Preview | 種別 |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | 本番Supabaseプロジェクトの値 | 本番と同じ、または別のSupabaseプロジェクトの値（運用方針による） | 公開 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 本番Supabaseプロジェクトの値 | 同上 | 公開 |
| `NEXT_PUBLIC_SITE_URL` | `https://urasupo.jp` | Vercelが割り当てるPreview URL（`https://` 必須） | 公開 |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番Supabaseプロジェクトの値 | 同上（Previewでcronを検証しない場合は未設定でも起動には問題ないが、`/api/cron/verification`実行時にエラーになる） | **秘密**（Sensitiveにする） |
| `CRON_SECRET` | 十分に長いランダムな値 | 設定してもよい（Preview環境でCronは自動実行されない。手動確認用） | **秘密**（Sensitiveにする） |
| `URASUPO_DEMO_MODE` | **設定しない** | 設定しない（設定すると本番実行環境で起動時に例外） | - |
| `NEXT_DIST_DIR` | 設定しない（実DB版E2E専用のローカル切替） | 設定しない | - |

- 秘密の値（`SUPABASE_SERVICE_ROLE_KEY`・`CRON_SECRET` など）は、追加フォームの上部にある **Sensitive** スイッチを
  Enabled にしてから登録してください（登録後は値を読み出せなくなります）。Sensitive は Production と Preview でのみ使えます。
  既存の変数を後から Sensitive にするには、いったん削除して登録し直します。
- Preview環境で `NEXT_PUBLIC_SITE_URL` にVercelの自動生成URL（`https://<branch>-<project>.vercel.app`
  のような形）を固定で入れることは難しいため、Preview環境でログインメールのリンクを実際に検証したい
  場合は、そのPreview URLを都度 `NEXT_PUBLIC_SITE_URL` に設定し直すか、Preview環境専用の固定URL
  （Preview 用に独自ドメインを割り当てる方法。手順は Vercel の Domains のドキュメント参照）を使ってください。日常のPreviewデプロイでは
  未設定・不正確でも起動時に例外になるだけで、ビルド自体は失敗しません（`next build`はサーバー実行時
  の環境変数評価をビルド時に強制しないため。※Server ActionsやAPI Routeの実行時にのみ例外が出ます）。

### 4.3 Cron（`vercel.json`）

現在の `vercel.json` は以下の設定です。

```json
{
  "crons": [
    { "path": "/api/cron/verification", "schedule": "0 18 * * *" }
  ]
}
```

- スケジュールはUTC基準です。`0 18 * * *` は **UTC 18:00 = 日本時間（JST, UTC+9）翌日 3:00** です。
  日本時間の別の時刻に変更したい場合は、目的の日本時間からUTCへ変換してから `schedule` を書き換えて
  ください（JSTはUTCより9時間進んでいるため、UTC時刻 = JST時刻 − 9時間、日付が負になる場合は前日）。
- 実装（`src/app/api/cron/verification/route.ts` / `authorize.ts`）は、`Authorization: Bearer
  <CRON_SECRET>` のヘッダーが一致しないと401を返します。Vercel は、プロジェクトに環境変数 `CRON_SECRET`
  が設定されていれば、Cron 実行時にその値を `Authorization: Bearer <値>` として自動で付けます（公式ドキュメントで
  確認済み）。値は16文字以上のランダムな文字列にしてください。公開後は 5節のチェックリストで Cron のログが
  401 になっていないことを確認します。
- Cron は失敗しても再実行されず、まれに実行漏れや二重実行があります。この実装は行ロック（`FOR UPDATE SKIP LOCKED`）
  と勧告ロックで二重実行に備え、毎回「未処理のもの全部」を処理するため、1日分の漏れは翌日に取り戻せます。
- **Vercel の無料（Hobby）プランの Cron の制約**（2026年9月時点）: 1日1回まで（それより頻繁な式はデプロイが失敗する）、
  実行時刻は指定した時の中で最大59分ずれる、1プロジェクト100件まで。現在の設定（1日1回、UTC 18時台 = 日本時間 3時台）は
  この制約の範囲内なので、Hobby プランのままで動きます。

### 4.4 独自ドメイン urasupo.jp

1. Vercel のプロジェクトの Settings → Domains で `urasupo.jp` を追加する。
2. Vercelが提示するDNSレコード（通常は `A` レコードをVercelのIPへ、または `www` 等のサブドメインなら
   `CNAME` をVercelのホスト名へ）を、ドメインのDNS管理画面（レジストラ等）に追加する。
   **具体的なレコード値はVercelが追加時にその場で表示するものを使ってください**（固定のIPアドレスを
   ここに書くと将来Vercel側の変更で古くなるため、この文書には記載しません）。
3. DNS反映（数分〜最大48時間程度、多くは数十分以内）を待ち、Vercelダッシュボードで「Valid Configuration」
   等の表示になることを確認する。
4. `NEXT_PUBLIC_SITE_URL=https://urasupo.jp` をVercelのProduction環境変数に設定済みであることを再確認
   し、Supabaseの Redirect URLs に `https://urasupo.jp/**` が入っていることも再確認する。

---

## 5. 公開直後の確認チェックリスト

- [ ] `node scripts/check-production-env.mjs` を、Vercelに設定した実際のProduction環境変数を読める
      環境（例: `vercel env pull` で取得した `.env.production.local` を読み込んだシェル）で実行し、
      すべてOKであることを確認する。
- [ ] `https://urasupo.jp/start` が表示される（デモモードの表示・挙動になっていないこと）。
- [ ] ログイン（マジックリンク）を実際のメールアドレスで試し、**日本語の件名・本文**でメールが届く
      ことを確認する（1. と 2. のメールテンプレート設定が反映されているか）。
- [ ] 届いたメールのリンクから `https://urasupo.jp/auth/callback` 経由でログインでき、`/start` の
      居住街の保存ができることを確認する。
- [ ] Cronの手動実行確認: `curl -H "Authorization: Bearer <CRON_SECRET>" https://urasupo.jp/api/cron/verification`
      を本人が実行し、`401` ではなく処理結果のJSONが返ることを確認する（CRON_SECRETの値は本人だけが
      知っている前提。この手順書には値を書かない）。あわせてVercelのCron実行ログ（プロジェクトの
      Settings → Cron Jobs → View Logs）で、自動実行が UTC 18時台（日本時間 3時台）に 200 で成功しているか確認する。
- [ ] デモモードが無効であること: 本番の環境変数一覧に `URASUPO_DEMO_MODE` が**存在しない**ことを
      Vercelダッシュボードで直接確認する（`check-production-env.mjs` のOK表示でも確認できる）。
- [ ] 公開されているスポットが、投入した想定のデータ（3節）と一致しているか（架空のデモデータが
      混入していないか）を実際の画面で確認する。

---

## 6. ロールバック手順

### アプリ（Vercel）

- プロジェクトの概要ページの Production Deployment の枠にある **Instant Rollback** → 戻す先を選んで **Continue**
  → **Confirm Rollback** で即座に切り戻せます（再ビルド不要）。Hobby プランで戻せるのは**直前の本番デプロイだけ**です。
- 切り戻すと、本番ブランチへの新しいプッシュは自動では本番に出なくなります。修正を出すときは、同じ枠の
  **Undo Rollback** で通常の状態に戻してください。
- 切り戻しでは環境変数は戻りません（値はそのまま）。Cron の設定は、戻した先のデプロイの状態に戻ります。

### データベース（Supabase）

- **マイグレーションのロールバック用のdownスクリプトはこのリポジトリに用意されていません。**
  `supabase/migrations/` は前進のみの前提です。マイグレーション適用後に問題が見つかった場合は、
  問題を修正する新しいマイグレーションを追加して `npx supabase db push` する方針を基本にしてください。
- 本番DBの破壊的な変更（列やテーブルの削除など）を伴うマイグレーションを適用する前には、Supabase
  の無料プランには**自動バックアップがありません**（Pro プランは直近7日分の日次バックアップ）。無料プランで
  運用する間は、マイグレーション適用の前と定期的に `npx supabase db dump` で手元にバックアップを取ってください。
- Cronの一時停止が必要な場合は、`vercel.json` の `crons` を空配列にしてデプロイするか、Vercel
  ダッシュボードのプロジェクトの Settings → Cron Jobs にある **Disable Cron Jobs** で止めてください。

---

## 付録: よくある事故の防止

- `.env.local` や実際の値を書いたファイルは絶対にコミットしない（`.gitignore` の対象になっている
  ことを確認してください）。
- `SUPABASE_SERVICE_ROLE_KEY` はブラウザに渡さない（`NEXT_PUBLIC_` を付けない）。
- 本番の環境変数に `URASUPO_DEMO_MODE=1` を絶対に入れない（入れると本番アプリが起動時に例外で
  落ちる。これは意図した安全装置です）。
