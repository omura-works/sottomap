# 最終レビューの手順（Codex 最上位モデル）

最終レビューは Claude のエージェントではなく **Codex の最上位モデル**に任せる（ユーザー指定、2026-09-10）。
実装に関わっていない別の系統のモデルに見せることで、同じ思い込みを共有しないレビューになる。
Codex は Anthropic のクレジットを消費しない。

## 呼び出し設定（`mcp__codex__codex`）

| 項目 | 値 |
|---|---|
| `model` | `gpt-5.6-sol`（Codex の最上位） |
| `config` | `{ "model_reasoning_effort": "max" }` |
| `sandbox` | `read-only`（レビューはコードを変更しない） |
| `approval-policy` | `never` |
| `cwd` | `C:\Users\souya\Documents\urasupo` |

推論強度は `low / medium / high / xhigh / max / ultra`。`max` が純粋な推論の最上位。
`ultra` は Codex 内部で作業を自動分担する段階で最も遅い。レビュー範囲が非常に広いときだけ使う。

**使えない場合**: アカウントで `gpt-5.6-sol` が使えない、または Codex MCP が壊れている
（2026-09-10 の自動更新で `codex-code-mode-host.exe` が見つからない状態になった）ときは、
エラー文をそのままユーザーに見せて判断を仰ぐ。黙って Claude のレビューに差し替えない。

## 事前準備（オーケストレータ）

レビュー対象の差分を1ファイルにまとめて渡す。Codex に git を何度も叩かせない。

```bash
git log --oneline <BASE>..HEAD > .superpowers/sdd/urasupo/final-review-package.txt
git diff --stat <BASE>..HEAD >> .superpowers/sdd/urasupo/final-review-package.txt
git diff -U10 <BASE>..HEAD >> .superpowers/sdd/urasupo/final-review-package.txt
```

`<BASE>` はレビューしたい範囲の起点（全体なら初回コミット `2653fb5`）。

## プロンプトの骨子

```
あなたは「ウラスポ」の最終レビューを行います。コードは変更せず、読むだけで判定してください。日本語で回答。

## 読むもの
1. .superpowers/sdd/urasupo/final-review-package.txt（レビュー対象の全差分）
2. docs/SPEC.md（§9 が最優先）と docs/CONTRACT.md（末尾の追補を含む）
3. .superpowers/sdd/urasupo/progress.md の「minor (deferred)」「Ruling:」の行
   — 先送りした軽微事項と、オーケストレータが下した判断。マージ前に直すべきものがあるか選別すること

## 観点
- 正しさ: ドメインルール（静けさ・ライフサイクル・90日確認・並び順・ポイントの冪等性）が SPEC §9 どおりか
- セキュリティ: RLS の抜け、認可の無い Server Action / API、CRON_SECRET の検証
- 結線漏れ: 旧 API（@deprecated）の呼び出し残り、フィクスチャ専用の経路が本番に残っていないか
- 表示: UIコピーが SPEC の原文どおりか、PC/スマホで二重表示や欠落がないか
- テスト: 主要ルールの境界値が本当に検証されているか（何も確かめていないテストがないか）

## 出力
- 重大（マージ前に必須）/ 重要 / 軽微 の3段階。各指摘に「ファイル:行 / 何が起きるか（具体的な入力→誤った結果）/ 推奨修正」
- 先送り事項・判断への所見（それぞれ「妥当」か「マージ前に直すべき」か）
- 最後に総合判定: マージ可 / 条件付きで可 / 不可
```

## レビュー後

指摘は **1体の修正担当（`urasupo-implementer`）にまとめて1回だけ**渡す（指摘ごとに分けない）。
修正後は同じ Codex スレッドに `codex-reply` で修正差分だけを見せて再確認する。
残った指摘はユーザーに判断を仰ぐ。
