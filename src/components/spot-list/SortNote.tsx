import { Card } from "@/components/ui";

/**
 * S3 検索末尾の注記カード「並び順について」。
 * 文言は SPEC §1「プロダクトの思想」の該当行を一字一句そのまま使う
 * （§2.4 の並び順ルールを平易に説明した文で、デザイン原本 artboards.html にも
 * 同じ文言で掲載されている）。
 */
export function SortNote() {
  return (
    <Card kicker="並び順について" elevation="sm">
      混みはじめた店は、検索結果の下へ静かに下がります。上に出るのは、地元がまだ静かだと答えた店だけです。
    </Card>
  );
}
