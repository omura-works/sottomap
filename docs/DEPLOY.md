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

### アクセストークン（JWT）の有効期限（R22 軽微2）

退会（4.6節「退会の手順」の `delete_account`）で `auth.users` の行を消しても、**すでに発行したアクセストークン（JWT）は
有効期限まで失効しません。** Supabase 公式の説明では、サインアウト等でセッションとリフレッシュトークンが消えても、
アクセストークンは `exp`（有効期限）まで有効のままで、利用者はすぐにはログアウトされません
（[Signing out](https://supabase.com/docs/guides/auth/signout)）。退会した人の手元に、最長でこの有効期限のあいだ
ログインの情報が残り得る、ということです。そのため、有効期限は短め（**1時間以下**）にしておく。

1. Supabase ダッシュボードの **Authentication → Sessions**（Auth settings の Sessions。
   `https://supabase.com/dashboard/project/<プロジェクトID>/auth/sessions`）を開く。
2. アクセストークンの有効期限（JWT expiry）が **3600秒（1時間）以下**になっていることを確かめる。長ければ3600に直して保存する。
   - Supabase 公式は、ほとんどのアプリには既定の1時間を勧め、1時間を超える値は安全上勧めない、5分未満は時計のずれ等で
     不具合の元になるので使わない、としている（[User sessions](https://supabase.com/docs/guides/auth/sessions) の FAQ）。
     このリポジトリのローカル設定（`supabase/config.toml` の `jwt_expiry = 3600`）も1時間。
   - 設定を変えても、発行済みのトークンは変わらない（次に発行されるものから効く）。
3. 画面の項目名・場所が上と違う場合は、Supabase 公式の [User sessions](https://supabase.com/docs/guides/auth/sessions)
   で最新の場所を確かめる（要確認。この節は 2026-09-25 に同ページと [Signing out](https://supabase.com/docs/guides/auth/signout)
   で確認した内容）。

> 退会の直後に、有効期限内のトークンでデータベースの API が呼ばれたときの扱い: `delete_account` で本人のデータは
> `on delete cascade` で消えている。R22 レビュー（Codex）では、主な書き込みの DB 関数はプロフィールの行や外部キーが無いため
> 失敗し、利用者のデータへ再びアクセスできる経路は見つかっていない。ただし「退会と同時にログアウトされる」ことは保証されない。

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
6. 初めてレート制限を作るときは **Rate Limiting Pricing** の確認画面が出るので、内容を読んで
   **Continue** を押す。設定を終えたら **Save Rule** でルールを保存する。
7. **Review Changes** → **Publish** で反映する。
8. 反映後、自分の環境から60秒以内に十数件の POST を送り、次の2つを確認する。
   - 11件目以降の応答が **429**（または Deny の応答）になること。
   - Vercel の Logs に、その分の `/api/csp-report` の**関数実行が記録されていない**こと
     （＝関数に届く前に止まっている）。
9. しきい値は 8.1節のログ実測を見て調整する。件数はリージョンごとに数えるため、複数リージョンに
   分散したアクセスでは合計が設定値を超えることがある（公式ドキュメントの注記）。

### 4.6 お問い合わせ（`/contact`）の回数制限・運営への通知・保存期間（SPEC §9.17）

お問い合わせは Server Action がサーバー専用の service_role 接続で DB 関数 `submit_contact_message`
を呼んで保存する（利用者のブラウザからは直接呼べない）。4.2節の表に加えて、次の変数を設定する。

| 変数 | Production | Preview | 種別 |
| --- | --- | --- | --- |
| `CONTACT_RATE_SALT` | 32文字以上のランダムな値（**必須**。未設定だと送信がすべて拒否される） | 本番とは別の値 | **Secret** |
| `RESEND_API_KEY` | 通知する場合だけ。Resend の API キー | 設定しない（推奨） | **Secret** |
| `CONTACT_NOTIFY_TO` | 通知する場合だけ。運営のメールアドレス（複数はカンマ区切り） | 設定しない（推奨） | Config |
| `CONTACT_NOTIFY_FROM` | 任意。Resend で検証済みのドメインの送信元（例: `ウラスポ <notify@urasupo.jp>`） | 設定しない | Config |

**回数制限と容量。** 送信元IPはそのまま保存せず、`sha256(IP + CONTACT_RATE_SALT)` だけを
`public.contact_rate` に24時間残す。上限は**1時間に5件・1日に20件／送信元**、全体で**1日に500件**。
問い合わせが**10,000件**に達すると新規を受け付けない（Vercel の Logs に
`[contact] 問い合わせの保存件数が上限（10,000件）に達しています` が出る）。その場合は Supabase の
Table Editor で `contact_messages` の対応済み（`status = 'done'`）の古いものから削除する。
送信元IPは、Vercel がリクエストに付ける `x-real-ip`（無ければ `x-forwarded-for` の先頭）から読む。

**運営への通知（任意）。** `RESEND_API_KEY` と `CONTACT_NOTIFY_TO` の**両方**があるときだけ、保存に
成功したあと Resend の HTTP API（`POST https://api.resend.com/emails`）で短いメールを送る。
メールの本文は**用件・受付ID・受付時刻だけ**で、問い合わせの本文や返信先は載せない（内容は Supabase
の Table Editor で `contact_messages` を開いて読む）。送信に失敗しても保存は取り消さず、Vercel の Logs に
`[contact-notify]` で始まる行が残る。設定の手順:

1. Resend にアカウントを作り、**Domains** で送信に使うドメイン（例: `urasupo.jp`）を追加して、表示される
   DNS レコードを登録し、検証を済ませる。
2. **API Keys** で送信専用（Sending access）のキーを作り、`RESEND_API_KEY` に Secret で登録する。
3. `CONTACT_NOTIFY_TO` に運営の受信アドレス、`CONTACT_NOTIFY_FROM` に検証済みドメインの送信元を登録する。
   `CONTACT_NOTIFY_FROM` が空だと送信元は `onboarding@resend.dev`（Resend の検証用）になり、Resend の
   アカウントのアドレスにしか届かない。
4. `/contact` から試しに1件送り、通知が届くこと・本文に問い合わせの内容が無いことを確かめる。

> 確認済み（2026-09-24、Resend 公式ドキュメント）: 送信は `POST https://api.resend.com/emails`、認証は
> `Authorization: Bearer <APIキー>`、必須項目は `from`・`to`・`subject` と本文（`text` など）
> （[Send Email](https://resend.com/docs/api-reference/emails/send-email)）。二重送信を防ぐ `Idempotency-Key`
> ヘッダーは256文字まで・24時間保持（[Idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys)）。
> APIキーは送信だけできる **sending_access** の権限で作り、送信元ドメインに限定するとよい
> （[Create API key](https://resend.com/docs/api-reference/api-keys/create-api-key)）。

**保存期間。** 日次 cron（4.3節、`/api/cron/verification`。1日1回）の最後に DB 関数
`purge_expired_contact_data()`（service_role 専用）を呼び、次を削除する。実行が1日1回なので、
期限を過ぎたものは「そのあとの日次の処理」で消える（利用者向けの `/privacy`・`/faq` もこの書き方）。

- お問い合わせ（`contact_messages`）: **受付から1年を過ぎたあとの日次の処理**で削除（対応中かどうかにかかわらない。
  ログインせずに送った行〈`requester_id` が NULL〉も同じ）。ログイン中に送った行は、それより前に退会した場合、
  `delete_account` のときに一緒に消える（0014 で `requester_id` の外部キーを `on delete cascade` にした）。
- 送信元の記録（`contact_rate`）: **24時間を過ぎたあとの日次の処理**で削除（最大でおよそ48時間残る）。

削除に失敗すると cron の応答が500になり、Vercel の Logs に `[cron] お問い合わせの保存期間の処理に失敗しました`
が出る（翌日の実行で取り戻せる）。

**問い合わせの確認（担当・頻度）。** 問い合わせを読むのは運営者（Supabase の本番プロジェクトの管理者）。

- **週1回以上**、Supabase の Table Editor で `contact_messages` を開き、`status = 'new'` の行を確かめる。
  運営への通知を設定した場合は、通知を受けたらその都度確かめる（通知が届かないこともあるので、週1回の確認は続ける）。
- 読み始めたら `status` を `in_progress`、対応を終えたら `done` にする。
- `/contact` の約束は「内容を確認でき次第、対応します」（「速やかに」とは約束していない。SPEC §9.17-5）。

**掲載停止（`removal`）の対応。** 店を地図から外すときは、**必ず** SQL Editor で次を実行する（SPEC §9.17-8・§9.18-3）。

```sql
select public.remove_place('<スポットのID>', '<メモ（受付IDなど）>');
```

`spots.status` を Table Editor で直接 `expired` などに変えてはいけない。掲載停止リスト（`removed_places`）に
記録されず、同じ店の再投稿（同名・100m 以内）を止められない。同じ店の別の投稿が公開中なら、それぞれ
`remove_place` で外す。

**個人情報の請求（`privacy`）の対応。** 請求する人は3通り（利用者向けの説明は `/privacy` 10.）。請求の対象には、
その人の問い合わせの記録（`contact_messages`）も含む。回答は、本人確認のうえ遅滞なく行う。

- **`requester_id` がある（ログイン中に送った）:** そのアカウントのご本人からの請求として扱う。Supabase の
  **Authentication → Users** で `requester_id` のメールアドレスを確かめ、そのアドレス宛に回答する（プライバシーポリシーで
  メールの利用目的に「個人情報の請求への回答」を挙げている）。この経路では `reply_to` は保存されない（画面は欄を出さず、
  サーバーも捨てる）。
- **`requester_id` が無く、アカウントがある（ログインできない人）:** 下の「ログインできない人の請求の手順」で照合と
  本人確認をしてから回答する。
- **`requester_id` が無く、アカウントが無い（退会した人・登録の無い人）:** アカウントと、そのアカウントで
  ログイン中に送った問い合わせの記録は、退会のときに稼働中のDBから削除済み（下の「退会の手順」）。稼働中のDBに残るのは、
  ログインせずに送られた問い合わせ（`requester_id` が NULL）と、**退会の記録（`account_deletion_log`。30日）**だけ。ほかに、
  **Vercel のアクセスの記録・Supabase の認証の記録（各サービスの保存期間まで）**、**バックアップ（7.4節。最大30日）**、
  **運営が別に保管している台帳（7.4節の2.。30日）**が残る。
  これらもすべて請求の対象として受け付け、特定できる範囲で対応する（`/privacy` 10. の約束）。
  - `reply_to` 付きの問い合わせ（`requester_id` が NULL で、`reply_to` がそのアドレスのもの）: `reply_to` 宛に確認のメールを送り、
    返信を受け取れたこと（そのアドレスでメールを受け取れること）を確かめる。**内容を開示するときは、それに加えて**、受付日時・
    本文の一部など、送った本人でなければ分からないことを返信で答えてもらい、行の内容と合うことを確かめる（メールアドレスは
    共有・譲渡・使い回しがあり得るため、受け取れるだけでは元の送信者とは限らない）。
  - `reply_to` の無い問い合わせ: **一律に断らない。** 請求者が示した受付日時・本文の一部などで行を1件に特定でき、
    ほかの人の行と取り違えるおそれが無いと判断できれば、個別に対応する。特定できなければ、
    その旨を請求者の返信先に回答する。
  - アクセスの記録・認証の記録・バックアップ: 請求者が示した日時などで該当する記録を探し、見つかった範囲で対応する。
    Vercel・Supabase の記録は各サービスの画面で検索・確認し、運営が削除できないものは、保存期間が過ぎると消えることを回答する
    （各サービスで個別の記録を削除できるか・各社への依頼の経路は要確認。公開前に5節のチェックリストで確定する）。バックアップは、30日を過ぎたものの削除（7.4節）を待たずに消すかどうかを
    個別に判断する。

**ログインできない人の請求の手順。**

1. SQL Editor で、返信先とアカウントのメールアドレスを照合する（前後の空白と大文字・小文字の違いは無視して比べる）。
   `find_account_by_email` は service_role 専用で、ブラウザ（anon・authenticated）からは呼べない。

   ```sql
   select public.find_account_by_email('<問い合わせの reply_to>');
   ```

2. **NULL が返ったら** アカウントは無い。「登録が見つからない」として扱い、`reply_to` 宛にその旨を回答する
   （ほかのアドレスの登録の有無は伝えない）。そのアドレスで送られた、ログインしていない問い合わせが残っていれば、
   上の「アカウントが無い」の扱いに進む。
3. **ユーザーIDが返ったら** 一致したアカウントがある。**Authentication → Users** に表示されるそのアカウントの
   メールアドレス宛に確認のメールを送り（受付IDと請求の内容を書き、返信で意思を確かめる）、返信を受け取れたら
   本人確認できたものとする。
4. 本人確認ができたら請求に対応し、同じアドレス宛に回答する。退会（アカウントの削除）の請求なら、次の「退会の手順」へ。

**退会の手順。** 退会＝アカウントの削除。画面上の退会機能は無く、運営が次の手順で行う。

0. **先に台帳へ「予定」として記録する**（7.4節の2.。日時・ユーザーID・「退会（予定）」）。削除した後、台帳に書く前に
   作業が中断しても、あとで照合して気づけるようにするため。
1. 本人確認をする。ログイン中に送られた請求なら `requester_id` がそのアカウント。ログインせずに送られた請求なら、
   上の「ログインできない人の請求の手順」の1〜3（`find_account_by_email` で照合し、そのアドレス宛の確認のメールに
   返信を受け取る）を済ませ、返ってきたユーザーIDを使う。
2. SQL Editor で削除する。`delete_account` は service_role 専用。

   ```sql
   select public.delete_account('<ユーザーID>');
   ```

   `auth.users` の行が消え、`delete_account` が退会の記録（`account_deletion_log` にユーザーIDと退会の日時）を書き、
   `on delete cascade` で `public.users`（表示名・住んでいる街・灯りポイント）・投稿した店・
   承認・確認の回答と依頼・栞・灯りの台帳・バッジと、**そのアカウントの問い合わせ（`requester_id` が一致するもの）**が一緒に消える。
   ログインせずに送られた問い合わせ（`requester_id` が NULL）は消えない（本人から請求があれば、上の「アカウントが無い」の
   扱いで個別に対応する）。
3. **台帳の「予定」を「完了」にする**（7.4節の2.。日時・ユーザーID・「退会（完了）」。データベースとは別の、運営の端末の暗号化されたファイル）。
   「予定」のまま残っている行は、`account_deletion_log` と照合して、削除済みなら「完了」に、未削除なら削除をやり直す。
   バックアップから戻したときに、稼働中のDBが読めなくても退会をやり直せるようにするため。
4. 削除したことを、本人確認に使ったメールアドレス宛に知らせる。
5. 投稿した店が公開中だった場合は、削除と同時に地図から消える（`remove_place` は不要。店そのものが消えるため、
   掲載停止リストには載らない）。
6. 退会したあとも、そのアカウントのデータは、退会の前に取ったバックアップには最大30日残る（7.4節）。バックアップから
   戻したときは、7.4節の手順で、稼働中のDBの退会の記録（読めれば）と台帳をもとに `reapply_account_deletions()` を
   実行して、退会したアカウントを改めて削除する。
   退会の記録（`account_deletion_log`）は、日次 cron（4.3節）の最後の `purge_expired_account_deletion_log()` が、
   **退会から30日を過ぎたあとの日次の処理**で削除する（バックアップの保存期間と同じ30日）。
7. 発行済みのアクセストークン（JWT）は有効期限まで失効しない（2節「アクセストークン（JWT）の有効期限」）。

**問い合わせの個別削除・訂正（R23 重要2）。** 本人の請求などで問い合わせを1件削除するときは、Table Editor で行を消さず、
SQL Editor で次を実行する（service_role 専用。消したら `true`、無ければ `false`）。

```sql
select public.delete_contact_message('<受付ID>');
```

削除・訂正（本人の請求で行を書き換えたもの）は、**実行する前に台帳へ「予定」として記録し、実行したら「完了」にする**
（7.4節の2.。日時・受付IDなどの対象・内容）。「予定」のまま残った行は、稼働DBの状態と照合して完了させる。バックアップから戻したときに、7.4節の手順で同じ削除・訂正をやり直すため。

## 5. 公開直後の確認チェックリスト

- [ ] 4.5節の Firewall 設定を**公開前に**終えていること（最終状態が 429／Deny で、11件目が実際に
      止まることを確認済み）。
- [ ] **外部のログ（Vercel・Supabase）の扱いを公開前に確定する（R23 軽微）。** `/privacy` は、退会した人の
      「アクセスの記録・認証の記録（各サービスの保存期間まで）」も請求の対象として受け付けると書いている。次を確かめ、
      結果をこの手順書（4.6節の「アカウントが無い」の扱い）に書き足す。
      1. **利用プランのログ保存期間。** 公式の表（2026-09-25 確認）: Vercel の Runtime Logs は Hobby 1時間・Pro 1日・
         Pro＋Observability Plus 30日・Enterprise 3日・Enterprise＋Observability Plus 30日
         （[Vercel Runtime Logs](https://vercel.com/docs/logs/runtime) の Limits）。Supabase の Log retention（API & Database）は
         Free 1日・Pro 7日・Team 28日・Enterprise 90日（[Supabase Pricing](https://supabase.com/pricing)）。
         実際に契約するプランの値を確かめ、`/privacy` の「各サービスの保存期間まで」と矛盾しないことを確かめる。
      2. **認証の監査ログを DB に保存する設定の有無。** Supabase の認証の監査ログは外部のログ保存先に記録され、設定
         （Authentication → Audit Logs の "Write audit logs to the database"）を有効にすると `auth.audit_log_entries` 表にも
         保存される（[Supabase Auth Audit Logs](https://supabase.com/docs/guides/auth/audit-logs)）。本番でこの設定を
         有効にするかを決める。有効にするなら、その表の行（ユーザーID・IPアドレス・User-Agent を含む）も請求の対象で、
         退会のときに残るかどうか・消し方を確かめてから、`/privacy` と 4.6節に書く。
      3. **各社への削除依頼の経路。** 運営が画面から個別の記録を削除できない場合に、Vercel・Supabase のどの窓口
         （サポート・契約上の手続き）に依頼できるかを確かめる（要確認。この手順書にはまだ無い）。
      4. **削除できない場合に本人へ結果を知らせる手順。** 削除できなかった・対応しないと判断した場合も、その旨と理由
         （例: 保存期間が過ぎると消えること）を、請求者の返信先へ知らせる（4.6節の「アカウントが無い」の扱いと同じ）。
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
  常に null のため、実体は無い想定。`avatarUrl`（users）は 0011 で利用者からの書き込み権限を外しており、
  値（URL文字列）がある場合も `data.sql` に含まれるため別途のオブジェクト取得は不要。
  将来 `photoUrl` にアップロード機能を追加したら、この節にオブジェクトのバックアップ手順を追加すること）。

### 7.2 保存先

- 取得した `roles.sql` / `schema.sql` / `data.sql` / `migrations_schema.sql` / `migrations_data.sql` は、
  暗号化されたストレージ（例: 会社・個人で管理しているパスワードマネージャーの添付ファイル機能、
  暗号化した外部ドライブ、暗号化を有効にしたプライベートなクラウドストレージ）に保存する。
  **このリポジトリにコミットしない**（`.gitignore` の対象にすること。特に `data.sql` は
  利用者の個人情報を含み得る）。
- 定期取得の頻度は運用方針によるが、少なくとも「破壊的なマイグレーション適用の直前」には毎回取得する。
- **保存期間は取得から30日**（7.4節）。ファイル名か保存先のフォルダ名に取得日を入れておく。

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

### 7.4 保存期間（30日）と、戻したときの退会・削除・訂正の再適用（R22 重要4、R23 重要2）

バックアップには利用者の個人情報（アカウント・投稿・問い合わせなど）が入る。**退会した人のデータや、個別に削除・訂正した
データも、その前に取ったバックアップには元のまま残る。** そのため次を守る（利用者向けの説明は `/privacy` 9.・10.）。

1. **保存期間は取得から30日。** 30日を過ぎたバックアップ（7.1節の5ファイル一式）は、運営が保存先から削除する
   （`/privacy` では「最大30日」と約束しているので、取得のときに削除する日を予定に入れておき、30日を過ぎたら消す）。
2. **退会・削除・訂正の台帳（データベースとは別の場所）。** 退会（`delete_account`）・問い合わせの個別削除
   （`delete_contact_message`）・訂正（本人の請求で行を書き換えたもの）を行うたびに、その場で、運営の端末の
   **暗号化されたファイル**（台帳）に1行ずつ記録する。台帳は**データベースとも、バックアップの保存先（7.2節）とも別の場所**に
   置く（データベースが壊れて読めなくなっても、バックアップの保存先を失っても、台帳は残るようにする）。
   - 記録する項目: **日時**・**対象**（アカウントのユーザーID、または問い合わせの受付ID〈`contact_messages.id`〉）・
     **内容**（「退会」「問い合わせの削除」、訂正ならどの表のどの列をどう変えたか）。訂正の内容に個人情報が入るときは、
     台帳も個人情報として扱う（暗号化して保存し、コミットしない）。
   - **保存期間はバックアップと同じ30日。** 30日を過ぎた行は運営が台帳から消す（それより前のバックアップは1.で消えているので、
     再適用に要らない）。
   - あわせて、DB の中にも退会の記録（`account_deletion_log`）が残る。`delete_account` が消したアカウントのユーザーIDと
     退会の日時を書き、日次 cron の `purge_expired_account_deletion_log()` が退会から30日を過ぎたあとの日次の処理で消す。
     ただし、この記録は稼働中のDBの中にあるので、DBが読めなくなると使えない。台帳はその場合の備え。
3. **戻す前に（稼働中のDBが読めるなら）、今の退会の記録を控える。** バックアップを戻すと、`account_deletion_log` も
   バックアップを取った時点の内容に戻り、そのあとの退会が記録から消える。戻す前に、稼働中のDB（戻す先）の SQL Editor で
   次を実行し、結果を暗号化した保存先に控える（ユーザーIDを含む。7.2節と同じ扱い）。

   ```sql
   select user_id, deleted_at from public.account_deletion_log order by deleted_at;
   ```

   **稼働中のDBが読めない場合は、この控えは取れない。そのときは台帳（2.）だけをもとに、4.〜6. を行う。**
4. **戻したら、退会を再適用する。** 3. の控え（取れた場合）と台帳の「退会」の行を合わせ、戻したDBの
   `account_deletion_log` に無いユーザーIDを、退会の日時とともに入れ直す（`account_deletion_log` は利用者から読み書きできず、
   service_role も読むだけなので、入れ直しは SQL Editor で行う）。

   ```sql
   insert into public.account_deletion_log (user_id, deleted_at)
   values ('<ユーザーID>', '<退会の日時>')
   on conflict (user_id) do nothing;
   ```

   続けて次を実行する（service_role 専用。ブラウザからは呼べない）。

   ```sql
   select public.reapply_account_deletions();
   ```

   `account_deletion_log` にあるユーザーIDのアカウントが戻したDBに残っていれば、改めて削除される（`delete_account` と同じ
   cascade。戻り値は消した件数）。実行後、
   `select count(*) from auth.users where id in (select user_id from public.account_deletion_log);` が 0 であることを確かめる。
5. **戻したら、問い合わせの削除を再適用する。** 台帳の「問い合わせの削除」の行ごとに、受付IDを指定して次を実行する
   （service_role 専用）。消したら `true`、戻したバックアップにその問い合わせが無ければ `false` が返る（どちらでもよい）。

   ```sql
   select public.delete_contact_message('<受付ID>');
   ```

   実行後、台帳の受付IDがどれも `contact_messages` に残っていないことを確かめる。
6. **戻したら、訂正を再適用する。** 台帳の「訂正」の行ごとに、記録した内容のとおりに SQL Editor で同じ訂正をやり直す
   （対象の行が戻したDBに無ければ何もしない）。
7. 7.3節の復元試験（試験用の空プロジェクト）でも、台帳の写しを使って 4.〜6. を実行し、退会したアカウント・削除した
   問い合わせが残らず、訂正が反映されることを確かめる。

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
全体では500件。送信元ごとの上限を超えた分は全体の枠を消費しない）・重複排除・要約ログ（内訳は
上位20件＋残りの件数）を実装している。ただしこの状態は**関数実行環境（プロセス）ごとに
独立したメモリ**なので、Vercel が複数インスタンスに分散すると合計では上限を超え得る。プロセスの外で
効く制限として、公開前に Vercel Firewall（WAF）を設定する（4.5節）。

---

## 付録: よくある事故の防止

- `.env.local` や実際の値を書いたファイルは絶対にコミットしない（`.gitignore` の対象になっている
  ことを確認してください）。
- `SUPABASE_SERVICE_ROLE_KEY` はブラウザに渡さない（`NEXT_PUBLIC_` を付けない）。
- 本番の環境変数に `URASUPO_DEMO_MODE=1` を絶対に入れない（入れると本番アプリが起動時に例外で
  落ちる。これは意図した安全装置です）。
