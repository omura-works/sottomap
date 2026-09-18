import Link from "next/link";

// SPEC 本番公開前指示書 §2: 404 は日本語で、トップ／地図へ戻る導線を出す。
// 内部のエラーメッセージやスタックは出さない（見せるものが無いため安全）。
export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10 space-y-4">
      <h1 style={{ fontSize: 30 }}>ページが見つかりませんでした</h1>
      <p className="text-muted m-0">
        お探しのページは移動または削除された可能性があります。
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/start" className="btn btn-primary">
          トップへ戻る
        </Link>
        <Link href="/sapporo" className="btn btn-secondary">
          地図を見る
        </Link>
      </div>
    </div>
  );
}
