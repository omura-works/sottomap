import { redirect } from "next/navigation";

/**
 * Spec §4 にルート "/" の画面定義は無い（S1 は /start）。
 * T5 が /start（S1 街を選ぶ）を実装するまでの間も含め、"/" は常に /start へ
 * リダイレクトする。ファイル自体はどのタスクの所有領域にも明記されていないが、
 * T1 が用意する設定ファイル・骨格の一部として扱う。
 */
export default function RootPage() {
  redirect("/start");
}
