# そっとマップ 実装計画（Plan）

Spec: `docs/SPEC.md`（これが権威。矛盾したらSpecを採る）
デザイン原本: `docs/design-reference/`

---

## Global Constraints（全タスク共通・逸脱禁止）

1. **デザイントークンは Spec §5 の値をそのまま使う。** 新しい色・角丸・フォントを発明しない。
   見出しは `Zen Maru Gothic`、本文は `Zen Kaku Gothic New`。
   `.btn/.tag/.seg/.input` は `border-radius: 999px`、`.card` は `calc(28px * 1.15)`。
2. **UIコピーは Spec §4 の日本語を一字一句そのまま使う。**
   「どの街を歩きますか」「まだ静かなところから。」等は仕様であって例文ではない。
3. **PC・スマホ両対応のレスポンシブ。** モバイル 390px を基準に組み、`lg:`（1024px〜）で
   Spec §4 D1 の2ペインに切り替える。スマホ専用/PC専用の別実装を作らない。
4. **静けさの並び順（Spec §2.4）を破らない。** 一覧を返すすべての経路で適用する。
5. **架空データと実データを混ぜない。** 実在店名・住所は事実のみ。
   確認人数・ポイント・バッジは架空である旨の注記を残す（Spec §7）。
6. TypeScript strict。`any` 禁止。`npm run build` と `npm run lint` が通ること。
7. ドメインロジック（静けさ判定・並び順・ライフサイクル遷移）は
   **UIから切り離した純関数**にして Vitest で必ずテストする。
8. コミットは日本語の要約1行 + 箇条書き。1タスク1〜数コミット。

---

## Task 1: プロジェクト基盤とデザインシステム

**担当**: 基盤エージェント（先行・単独）

- `create-next-app` で Next.js 16（App Router / TypeScript / Tailwind v4 / ESLint）を
  リポジトリ直下に作成する。既存の `docs/` を壊さないこと。
- `src/app/globals.css` の Tailwind `@theme` に Spec §5 のトークンを全て写す。
  CSS変数名は Spec と同じ（`--color-bg`, `--color-accent-2`, `--radius-lg` …）にする。
- フォントを `next/font/google` で読み込む: `Zen_Maru_Gothic`（400/700/900）と
  `Zen_Kaku_Gothic_New`（400/500/700）。CSS変数 `--font-heading` / `--font-body` に割り当て。
- 共通UIを `src/components/ui/` に作る。**`docs/design-reference/design-tokens.css` の
  クラス定義を Tailwind/React に忠実に移植する**:
  `Button`（primary / secondary / ghost / block）、`Tag`（accent / accent-2 / neutral / outline）、
  `Card`（kicker / title / body / meta）、`Input` + `Field`（label + 文字数カウンタ対応）、
  `Segment`（昼/夜/朝 のような排他選択）、`Dialog`、`Divider`。
- レイアウト骨格 `src/app/layout.tsx`: 地色 `--color-neutral-200`、
  `text-wrap: pretty`、`:focus-visible` は `2px solid var(--color-accent)`。
- モバイル下部タブ（地図・さがす・栞・自分）と、`lg:` 以上でのサイドバー骨格。
  中身は空でよいが、ルートは Spec §4 のパスに合わせる。
- `/styleguide` ルートを作り、全UIコンポーネントを一覧表示する（目視確認用）。
- Vitest と Playwright をセットアップ（設定と1本ずつのスモークテストまで）。

**完了条件**: `npm run build` 成功。`/styleguide` が原本の配色・角丸・フォントで表示される。

---

## Task 2: データ層とドメインロジック

**担当**: データエージェント

- `supabase/migrations/0001_init.sql`: Spec §3 の全テーブル + PostGIS の `geography(Point)`。
  インデックス（`spots(city_id, status)`、位置のGIST）も張る。
- `supabase/migrations/0002_rls.sql`: Spec §3 の RLS 方針をポリシーとして実装。
- `supabase/seed.sql`: 街8件、タグ、Spec §7 の実在6店 + 各店のタグ・確認履歴。
  架空数値は seed 内コメントで架空と明示。
- `src/lib/supabase/` にサーバー/クライアント両用のクライアント生成。
- `src/lib/db/types.ts`: DB型を手書きで定義（生成物ではなく明示的に）。
- **`src/lib/domain/` に純関数**（ここが Vitest の対象）:
  - `quietness.ts` — 確認履歴から現在の静けさを決める（同数なら新しい方）
  - `ordering.ts` — Spec §2.4 の並び順比較関数
  - `lifecycle.ts` — pending→published（同じ街の2人）、published→dormant（無回答180日）、
    pending→expired（30日）、次回確認日の算出
  - `lantern.ts` — 灯りポイントとバッジ判定
- `src/lib/db/spots.ts` などのデータアクセス関数。一覧系は必ず `ordering.ts` を通す。
- Vitest で境界値を網羅（89日/90日/91日、承認1人/2人、同数の確認 など）。

**完了条件**: `npm run test` 全緑。マイグレーションとseedのSQLが構文的に妥当。

---

## Task 3: 地図と検索

**担当**: 地図エージェント（Task 1 完了後）

- `src/components/map/` に MapLibre GL JS の薄いラッパ（`MapCanvas`）。
  タイルは国土地理院 淡色。出典表記を必ず画面に出す。SSR回避のため動的import。
- ピン表現をデザインに合わせる（静けさで色を変えるが、**必ずラベルも併記**）。
- **S2 地図** `/[city]`: 全面地図、上部ヘッダ（街名・「静かなまま、38軒」・栞導線）、
  右下の丸い `＋`、ピン選択で下部にカード（この店を読む / 栞に挟む）。
- **S3 検索** `/[city]/search`: 検索入力、絞り込みチップ5種（「まだ静か」既定ON）、
  結果リスト、末尾の「並び順について」注記カード。
- **D1 PC版**: `lg:` 以上で左サイドバー（ブランド／街見出し／チップ／店リスト）＋
  右に大きな地図の2ペイン。地図上ホバーカード付き。同一コンポーネントで分岐すること。
- 位置情報が取れない場合のフォールバック（街の中心からの距離で代替）。

**完了条件**: 3画面が実データ（seed）で動作。並び順が Spec §2.4 どおり。

---

## Task 4: 投稿フローと90日検証

**担当**: 投稿エージェント（Task 1・2 完了後）

- **S5 ピンを立てる** `/[city]/spots/new`: 地図で位置選択、店名、
  「なぜ、あなたはここへ行くのか（60字まで）」＋**文字数カウンタ**、
  頻度セグメント（週1で行く/月1/年に数回）、説明カード「立てたあと」、送信。
  Server Action で `spots` に `status='pending'` として作成。
- 承認（endorsement）UI: 同じ街のユーザーに「行ったことがある」ボタンを出す。
  自分の投稿には出さない。2人目で `published` に遷移（`lifecycle.ts` を使う）。
- **S6 確認** `/verify/[requestId]`: 見出し「この店は、まだ隠れていますか」、
  「前回の確認から92日」、3択、履歴リスト、回答後の灯り演出「+5」。
- 定期処理 `src/app/api/cron/verification/route.ts`: 期限到来で確認依頼を作成、
  無回答180日で `dormant`、pending 30日で `expired`。Vercel Cron 設定も入れる。
- 灯りポイント加算は `lantern.ts` 経由。UI表示のON/OFF設定（原本の `showRewards`）を残す。

**完了条件**: 投稿→2人承認→公開→確認→+5 が一連で動く。cronハンドラにテストがある。

---

## Task 5: 詳細・栞・プロフィール・オンボーディング

**担当**: 画面エージェント（Task 1・2 完了後）

- **S1 街を選ぶ** `/start`: 街チップ8、歩きかたセグメント（昼/夜/朝）、
  「今週、静けさが確認された店」3件、件数フッター、「歩きはじめる」。
- **S4 スポット詳細** `/[city]/spots/[id]`: 写真（未設定はプレースホルダ）、
  パンくず的な「札幌・北24条 / 海鮮丼」、店名、タグ列、投稿者の引用＋署名、
  静けさカード（「まだ静かです」「12日前、地元の3人が…」）、栞に挟む＋道順。
- **S7 プロフィール** `/me`: アバター、居住年数、数値3つ、灯りバッジ列（未取得はグレー）、
  「あなたが書いた店」、「確認待ちが2件あります」注意カード。
- **S8 栞** `/bookmarks`: 「挟んだ店」、件数リード、リスト（予定日時つき）、
  「N軒を地図にまとめる」→ S2 へ選択集合を渡す。
- 栞の追加/削除は Server Action。楽観的更新にする。
- About/フッターに Spec §7 の「架空データ」注記と地図出典を置く。

**完了条件**: 4画面が seed データで動作。PC/スマホ両方でレイアウト崩れなし。

---

## Task 6: 認証・結線・通し確認

**担当**: Codex（`mcp__codex__codex`）→ 結果を私が検収

- Supabase Auth（メールリンク）でログイン/ログアウト。`users` 行の作成と `home_city_id` 設定。
- 未ログイン時の見せ方: 閲覧は可、投稿・承認・確認・栞は要ログイン。
- 全ルートの型・lint・build を通す。壊れた import や未使用を掃除。
- Playwright で主要動線を1本ずつ: 街選択→地図→詳細→栞 / 投稿→承認→公開 / 確認→+5。
- README に起動手順（Supabaseローカル、環境変数、seed投入）を書く。

**完了条件**: `npm run build`・`npm run lint`・`npm run test`・`npx playwright test` が全て通る。

---

## 依存関係

```
T1 基盤 ──┬── T3 地図・検索 ──┐
          ├── T4 投稿・検証 ──┼── T6 結線（Codex）
T2 データ ┴── T5 画面群 ──────┘
```

T1 と T2 は並行可（T2 はUIに触らない）。T3・T4・T5 は T1+T2 完了後に並行可。
