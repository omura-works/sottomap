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
Hobby プランの Cron 制約、`db push` のオプション、URL 設定・メールテンプレート・SMTP の画面、
Config/Secret 環境変数）を確認済みです。

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
   - `db push` は既定ではシードを流しません（`--include-seed` を付けたときだけ流れる）。**本番では `--include-seed` を付けないこと**（`supabase/seed.sql` には架空のデモユーザー・確認履歴が含まれるため。3節の初期データの扱いを参照）。街・タグ・バッジ（`supabase/migrations/0008_reference_data.sql`）は通常のマイグレーションとして `db push` に含まれるため、この番号を指定しない全体適用で自動的に投入される。
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

本番に必須の参照データ（`cities`＝街8件・実在の北海道の自治体名、`tags`＝タグの定義、
`badges`＝バッジの定義）は、`supabase/migrations/0008_reference_data.sql` に**冪等な
マイグレーションとして**含まれています（R13レビュー重要4）。実在の店・利用者の個人情報は
含みません。少なくとも `cities` が0件だと `/start` を含む全画面が「街が準備されていません」の
空状態になり、投稿・地図表示が始まりません。

- **本番へ自動で入る**: `cities` / `tags` / `badges`（0008。1節の `npx supabase db push` で他の
  マイグレーションと同じ番号順に適用される。個別に流す操作は不要）。
- **本番に入れてはいけない**: `supabase/seed.sql` に残っている `auth.users` / `users`（架空の
  デモユーザー10件）、`spots`（架空の確認履歴・承認・静けさステータスを持つ店舗データ。店名・住所
  自体は実在店舗の公開情報だが、確認人数や承認履歴はゲーム上のデモデータ）、`endorsements`、
  `verifications`、`verification_requests`、`bookmarks`。これらは `README.md` の「実データ方針」
  注記のとおりアーキテクチャ実演用の架空データであり、実店舗の事実の主張として公開してはいけません。
  `db push` は `--include-seed` を付けない限り `seed.sql` を流さないため、通常の手順のままなら
  混入しません。

適用後の確認（本人が Supabase ダッシュボードの SQL Editor か `psql` で実行する。件数・IDに
秘密情報は無いためログに残しても問題ありません）:

```sql
select count(*) as cities_count from cities;   -- 期待値: 8
select count(*) as tags_count   from tags;      -- 期待値: 10
select count(*) as badges_count from badges;    -- 期待値: 3
select slug, name from cities order by slug;    -- asahikawa/furano/hakodate/kushiro/obihiro/otaru/sapporo/wakkanai の8件
```

件数が0や期待値と異なる場合は、0008マイグレーションが未適用（`npx supabase db push --dry-run` で
未適用一覧を確認）か、既存データが手動編集されている可能性があります。

実店舗のデータ（`spots` 相当）を本番に載せる場合は、実際の投稿フロー（`create_spot` DB関数経由、
§9.13.2）で、実在の利用者が居住街を確認した上で投稿し、同じ街の2人の承認を経て公開する運用に
乗せてください。シードとして直接INSERTしないでください。

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
| `NEXT_PUBLIC_SUPABASE_URL` | 本番Supabaseプロジェクトの値 | Preview専用のSupabaseプロジェクトの値（推奨）。本番と同じにすると、レビュー前のコードが本番データを読み書きし得る | Config |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 本番Supabaseプロジェクトの値 | 同上 | Config |
| `NEXT_PUBLIC_SITE_URL` | `https://urasupo.jp` | Vercelが割り当てるPreview URL（`https://` 必須） | Config |
| `SUPABASE_SERVICE_ROLE_KEY` | 本番Supabaseプロジェクトの値 | **本番と同じ値は使わない。**設定しない（推奨）か、Preview専用のSupabaseプロジェクトの値。未設定だと `/api/cron/verification` の手動実行だけがエラーになる | **Secret** |
| `CRON_SECRET` | 32文字以上のランダムな値 | 設定してもよい（Preview環境でCronは自動実行されない。手動確認用） | **Secret** |
| `URASUPO_DEMO_MODE` | **設定しない** | 設定しない（設定すると本番実行環境で起動時に例外） | - |
| `NEXT_DIST_DIR` | 設定しない（実DB版E2E専用のローカル切替） | 設定しない | - |

- Vercel は2026年8月24日から、環境変数の秘匿区分を旧来の「Sensitive」トグルではなく
  **Config**（通常の値）／**Secret**（秘密の値）の2種類から選ぶ形に変えています（[Vercelの変更履歴](https://vercel.com/changelog/environment-variables-now-use-config-and-secret-types)）。
  秘密の値（`SUPABASE_SERVICE_ROLE_KEY`・`CRON_SECRET` など）は、追加フォームで種別を **Secret** にして
  登録してください（登録後は値を読み出せなくなります。`vercel env pull` でも値は取得できません）。
  Secret は Production・Preview に加えて **Development にも設定できます**（旧「Sensitive」の
  Production/Preview限定という制約は無くなっています）。既存の変数を後から Secret にするには、
  いったん削除して登録し直します。**本番用の Secret の値は、Preview・Development 用の値とは別の
  値にしてください**（同じ値を使うと、Preview環境からの操作が本番のSupabase等に影響し得ます）。
  この「登録後は読み出せない」性質のため、`scripts/check-production-env.mjs` による事前確認は
  Vercel へ登録する**前**に、本人が値を入れた `.env.production.local` に対して行う運用にしてください
  （5節「公開直後の確認チェックリスト」の最初の項目を参照）。
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
  確認済み）。値は32文字以上のランダムな文字列にしてください（`scripts/check-production-env.mjs` が
  32文字未満・空白混入・既定値そのまま・同じ文字の繰り返し等を失敗として検出します）。公開後は 5節の
  チェックリストで Cron のログが401になっていないことを確認します。
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

### 4.5 Firewall（`/api/csp-report` のレート制限）※公開前に必ず行う

`/api/csp-report` は誰でも送れる受信口なので、送信元ごとの制限を Vercel 側に置く。アプリ側にも
同じ制限があるが、関数プロセスごとのメモリなので、これだけでは足りない（8.3節）。

1. Vercel プロジェクトのサイドバーから **Firewall** を開き、右上の **Configure** → **+ New Rule**。
   レート制限は**全プランで使える**（Hobby は1プロジェクトに**1ルール**まで。Pro は40ルール）。
2. **If** の条件にパス `/api/csp-report`、メソッド `POST` を指定する。
3. **Then** で **Rate Limit** を選ぶ。集計方式は **Fixed Window**、時間窓は 60秒。
   数える単位（key）は **IP** を選ぶ。**JA4 Digest** は TLS の特徴による指紋で、利用者1人を表す値では
   ないため（同じ環境の多数の利用者が同じ値になる）、最初は使わない。使うなら公開後の実測を見てから。
4. しきい値は **60秒あたり10件／送信元**（アプリ側の20件／送信元より**小さく**する。アプリ側まで
   届く前に止めるため）。
5. 動作は **Default（429）** または **Deny** にする。**最終状態を必ずこのどちらかにすること。**
   **Log** は記録するだけで一切ブロックしないので、公開前の短時間の観測だけに使い、そのまま公開しない。
6. **Review Changes** → **Publish** で反映する。
7. 反映後、自分の環境から60秒以内に十数件の POST を送り、次の2つを確認する。
   - 11件目以降の応答が **429**（または Deny の応答）になること。
   - Vercel の Logs に、その分の `/api/csp-report` の**関数実行が記録されていない**こと
     （＝関数に届く前に止まっている）。
8. しきい値は 8.1節のログ実測を見て調整する。件数はリージョンごとに数えるため、複数リージョンに
   分散したアクセスでは合計が設定値を超えることがある（公式ドキュメントの注記）。

## 5. 公開直後の確認チェックリスト

- [ ] 4.5節の Firewall 設定を**公開前に**終えていること（最終状態が 429／Deny で、11件目が実際に
      止まることを確認済み）。
- [ ] `check-production-env.mjs` は Vercel へ登録する**前に**、本人が値を入れた
      `.env.production.local` に対して実行する運用にする（Secret 種別にした環境変数は、
      登録後は `vercel env pull` 等で値を取り出せなくなるため）。
      具体的には、`.env.example` を `.env.production.local` にコピーして本人が実際の値を
      直接書き込み、`node --env-file=.env.production.local scripts/check-production-env.mjs`
      を実行してすべて OK であることを確認したあと、その値を4.2節の手順で Vercel の
      Production 環境変数（秘密の値は Secret）に登録する。登録後に値を変更した場合は、
      変更した値をもう一度 `.env.production.local` に書いて再チェックしてから登録し直す
      （事後に `vercel env pull` で取得して確認することはできない）。`.env.production.local`
      はコミットしないこと（`.gitignore` の `.env*` に含まれる）。
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

### アプリ（Vercel）とCron（R13レビュー重要7の追補）

**Instant Rollback だけでは Cron の状態は保証されません。** 現在の Vercel Cron 管理ガイドは
「Rollback だけではアクティブな Cron が更新されない」としており、過去の Instant Rollback の説明
（Cron も戻る）とは食い違います。安全側に倒し、必ず次の順序で行ってください。

1. **① Cron を止める**: プロジェクトの Settings → Cron Jobs → **Disable Cron Jobs** で、ロールバック
   作業中に意図しないスケジュールやシークレットの不一致で Cron が動くのを防ぐ。
2. **② Instant Rollback**: プロジェクトの概要ページの Production Deployment の枠にある
   **Instant Rollback** → 戻す先を選んで **Continue** → **Confirm Rollback** で即座に切り戻す
   （再ビルド不要）。Hobby プランで戻せるのは**直前の本番デプロイだけ**。切り戻すと、本番ブランチへの
   新しいプッシュは自動では本番に出なくなる（修正を出すときは同じ枠の **Undo Rollback** で戻す）。
   切り戻しでは環境変数は戻らない（値はそのまま）。
3. **③ 目的の `vercel.json` の状態を明示的に再デプロイ**: ロールバック先のデプロイに含まれる
   `vercel.json` の `crons` 設定が、今動かしたいスケジュールと一致しているかを確認する。一致しない
   場合は、目的の `vercel.json` を含むコミットを明示的に再デプロイする（Rollback 操作に Cron 設定の
   復元を委ねない）。
4. **④ Cron を有効化して実行ログを確認**: Settings → Cron Jobs で有効化し直し、次回実行後に
   View Logs でスケジュール・ステータス（200）を確認する。手動確認したい場合は本人が
   `curl -H "Authorization: Bearer <CRON_SECRET>" https://urasupo.jp/api/cron/verification` を実行し
   401 ではなく処理結果のJSONが返ることを確認する。

### データベース（Supabase）

- **マイグレーションのロールバック用のdownスクリプトはこのリポジトリに用意されていません。**
  `supabase/migrations/` は前進のみの前提です。マイグレーション適用後に問題が見つかった場合は、
  問題を修正する新しいマイグレーションを追加して `npx supabase db push` する方針を基本にしてください。
- 本番DBの破壊的な変更（列やテーブルの削除など）を伴うマイグレーションを適用する前には、必ず7節の
  バックアップ手順でダンプを取ってください。Supabase の無料プランには**自動バックアップがありません**
  （Pro プランは直近7日分の日次バックアップ）。

---

## 7. バックアップ・復元（R13レビュー重要5の追補）

`npx supabase db dump --linked` を素朴に実行すると**既定ではデータを含まない**ため、それだけでは
「本番データのバックアップ」になりません。公式手順に合わせ、roles・schema・data を出力先ファイル付きで
個別に取得してください（オプション名は環境のCLIバージョンで変わりうるため、事前に
`npx supabase db dump --help` で確認する）。

### 7.1 取得（本人が実行する）

```bash
npx supabase login
npx supabase link --project-ref <本番プロジェクトのref>

# ロール定義（ユーザー・権限）
npx supabase db dump --linked -f roles.sql --role-only

# スキーマ（テーブル・関数・RLSポリシー等の定義。データを含まない）
npx supabase db dump --linked -f schema.sql

# データ（--use-copy で COPY 文にし、大量データでも高速・安定に出力する。
# storage.buckets_vectors / storage.vector_indexes はこのアプリで使っていないため除外する）
npx supabase db dump --linked -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"

# マイグレーション履行履歴（supabase_migrations スキーマ。schema_migrations テーブルに
# 適用済みマイグレーションのバージョン一覧が入っている）。既定の schema.sql / data.sql の
# 対象からは外れる（auth スキーマと同様、内部スキーマは既定で対象外）ため、
# --schema（-s）で明示的に指定して別ファイルに取得する。
npx supabase db dump --linked -f migrations_schema.sql --schema supabase_migrations
npx supabase db dump --linked -f migrations_data.sql --schema supabase_migrations --data-only --use-copy
```

上記は Supabase 公式（[Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、2026-09-19確認）どおりのコマンドです。`-x`（`--exclude`）・`--schema`（`-s`）オプションは
`npx supabase db dump --help` で存在を確認済みです。今後のCLI更新で無くなっていた場合は、
**そのまま実行せずに作業を止めて**、Supabase公式の最新手順（または `pg_dump` での代替）を確認して
ください（オプション無しで実行すると、履行履歴が入らないダンプができてしまいます）。

- 5ファイル（`roles.sql` / `schema.sql` / `data.sql` / `migrations_schema.sql` / `migrations_data.sql`）が
  揃って初めて復元可能なバックアップになります。いずれか1つだけでは不十分です。
- **マイグレーション履行履歴（`migrations_schema.sql` / `migrations_data.sql`）を復元しないまま
  復元先で `npx supabase db push` を実行すると、`supabase/migrations/` の 0001〜0008 が
  「未適用」と判断され、既に適用済みの定義（テーブル・関数等）に対して再実行を試みて失敗、または
  想定外の状態になる危険があります。** 復元後は必ず7.3節の手順で履行履歴も復元し、
  `schema_migrations` の内容を確認してください。
- `auth` スキーマ（`auth.users` 等の認証情報）は上記の通常の `db dump` では対象外になることがあります。
  認証情報を含めて復元したい場合は、Supabase の最新ドキュメント（本文書冒頭の確認日以降に変更が
  あり得る）で `auth` スキーマの扱いを確認し、必要なら別途 `--schema auth` 相当のオプションを付けて
  取得してください。**メールアドレス等の個人情報を含むため、取得したファイルは暗号化して保管する。**
- **Storage**（画像等の実オブジェクト）は `db dump` の対象外です。バケット単位でオブジェクトを
  別途エクスポートする必要があります（本アプリは現時点で `photoUrl`（spots）の書き込み経路が無く
  常に null のため、実体は無い想定。`avatarUrl`（users）は本人が PostgREST 経由で任意のURLを
  書き込める列だが、値そのもの（URL文字列）は `data.sql` に含まれるため別途のオブジェクト取得は不要。
  将来 `photoUrl` にアップロード機能を追加したら、この節にオブジェクトのバックアップ手順を追加すること）。

### 7.2 保存先

- 取得した `roles.sql` / `schema.sql` / `data.sql` / `migrations_schema.sql` / `migrations_data.sql` は、
  暗号化されたストレージ（例: 会社・個人で管理しているパスワードマネージャーの添付ファイル機能、
  暗号化した外部ドライブ、暗号化を有効にしたプライベートなクラウドストレージ）に保存する。
  **このリポジトリにコミットしない**（`.gitignore` の対象にすること。特に `data.sql` は
  利用者の個人情報を含み得る）。
- 定期取得の頻度は運用方針によるが、少なくとも「破壊的なマイグレーション適用の直前」には毎回取得する。

### 7.3 復元試験

**このリポジトリのローカル `supabase start`（マイグレーション・シード適用済み）には流さないこと。**
`schema.sql` には既に存在するテーブル・関数等の定義が含まれるため、「すでに存在する」エラーで
必ず失敗します。復元試験は、**このために新規作成した空の Supabase プロジェクト**（試験専用。
試験後は削除する）に対して行ってください。

Supabase 公式（[Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore)、
2026-09-19確認）どおり、`psql` で1つのトランザクションとして流します。

```bash
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file roles.sql \
  --file schema.sql \
  --file migrations_schema.sql \
  --command 'SET session_replication_role = replica' \
  --file data.sql \
  --file migrations_data.sql \
  --dbname "<復元先（試験用の空プロジェクト）の接続文字列>"
```

- `--single-transaction --variable ON_ERROR_STOP=1` により、1件でもエラーが出れば全体がロール
  バックされます。つまり、このコマンドが**エラーなく完了すれば流し込み自体は成功**したことになります
  （途中で一部だけ流れた状態にはなりません）。ただし、これは「SQLの実行順にエラーが出なかった」こと
  の確認であり、**それだけでは「完全に復元できた」ことにはなりません**。続けて件数（下記）と
  マイグレーション履行履歴を確認して初めて、復元が期待どおりかを確認したことになります。
- `SET session_replication_role = replica` は、`data.sql` / `migrations_data.sql` の投入時に
  トリガー・外部キー制約による順序依存のエラーを避けるためのものです（公式手順どおり）。
- `psql` は Supabase CLI には同梱されていません。[PostgreSQL公式のインストーラ](https://www.postgresql.org/download/)
  等で別途用意してください。

復元後、`npx supabase test db` は流さない（本番相当データに副作用のあるテストを実行しないため）。
代わりに次のSQLで件数とマイグレーション履行履歴が想定どおりか確認する。

```sql
select count(*) as cities_count from cities;
select count(*) as spots_count  from spots;
select count(*) as users_count  from users;
select count(*) as auth_users_count from auth.users;

-- マイグレーション履行履歴が復元されているか（0001〜0008が順に並んでいること。
-- この履歴が無いまま npx supabase db push を実行すると、適用済みのマイグレーションを
-- 未適用と判断して再実行を試みる危険があるため、db push の前に必ず確認する）。
select * from supabase_migrations.schema_migrations order by version;
```

- 上記の最後のクエリで `version` が `supabase/migrations/` にある0001〜0008の各ファイル名の
  先頭4桁（タイムスタンプ部分）と対応する行として並んでいることを確認する。1件でも欠けていたら、
  `migrations_schema.sql` / `migrations_data.sql` の取得または復元に問題があるため、それを解決してから
  `npx supabase db push` 等のマイグレーション操作を行うこと。
- このアプリは Vault や列レベルの暗号化を使っていません（`SUPABASE_SERVICE_ROLE_KEY` 等の秘密は
  Vercel の環境変数側で管理しており、DB内の列に暗号化データを置いていない）。そのため復元試験に
  暗号鍵の扱いは不要です。将来 Vault や列暗号化を使うようになった場合は、鍵（暗号化キー）の保管・
  復元手順をこの節に追加してください。
- 復元試験は、バックアップの取得方法が変わったとき（Supabase CLI のメジャー更新時等）や、少なくとも
  年1回程度は実施し、手順が古くなっていないか確認する。試験専用プロジェクトは確認後に削除する。

---

## 8. CSP（Content-Security-Policy）の強制移行（R13レビュー重要3の追補）

現在は `Content-Security-Policy-Report-Only` のみで、違反は `POST /api/csp-report` で受信し
`console.warn` の構造化ログに残ります（本文は個人情報を含まないよう要点だけに絞っている）。

### 8.1 Vercelのログで違反を確認する方法

- Vercel プロジェクトの **Logs**（または各デプロイの **Runtime Logs**）で、`/api/csp-report` への
  リクエストと、そこに紐づく `console.warn` 出力（`[csp-report] ...`）を検索する。
- 期間を指定して集計し、`blockedUriOrigin` が自サービス外の未知のオリジンばかりか、正規の機能
  （地図・ログイン等）に伴うものかを判別する。

### 8.2 強制（`Content-Security-Policy` ヘッダーへの切替）に移す判断基準と期限

- **期限の目安**: 公開後2週間、実際のトラフィックでCSP違反の観測期間を確保する。
- **切替の条件**: その2週間で、正規利用（地図表示・ログイン・投稿・確認等の一連の操作）に由来する
  違反が **0件** であること。0件でない場合は、許可リストを見直すか期限を延長し、再度2週間観測する。
- 切替時は `next.config.ts` の `Content-Security-Policy-Report-Only` を `Content-Security-Policy`
  に変更し、`report-uri`/`report-to` はそのまま残す（強制後の違反も観測を続けるため）。
- 切替後は、地図（MapLibre）・ログイン（マジックリンク遷移）・投稿フォームが実際に壊れていないかを
  本番で目視確認する（Report-Onlyの間は違反があっても機能を壊さないため、切替直後だけ想定外の
  ブロックが起きるリスクがある）。

### 8.3 `/api/csp-report` の濫用対策（設定手順の本体は 4.5節。ここは考え方）

`POST /api/csp-report` はブラウザが送るため認証を求めない設計のままだが、アプリ側
（`src/app/api/csp-report/rate-limit.ts`）で**送信元ごと**のレート制限（60秒あたり20件／送信元、
全体では500件）・重複排除・要約ログを実装している。ただしこの状態は**関数実行環境（プロセス）ごとに
独立したメモリ**なので、Vercel が複数インスタンスに分散すると合計では上限を超え得る。プロセスの外で
効く制限として、公開前に Vercel Firewall（WAF）を設定する（4.5節）。

---

## 付録: よくある事故の防止

- `.env.local` や実際の値を書いたファイルは絶対にコミットしない（`.gitignore` の対象になっている
  ことを確認してください）。
- `SUPABASE_SERVICE_ROLE_KEY` はブラウザに渡さない（`NEXT_PUBLIC_` を付けない）。
- 本番の環境変数に `URASUPO_DEMO_MODE=1` を絶対に入れない（入れると本番アプリが起動時に例外で
  落ちる。これは意図した安全装置です）。
