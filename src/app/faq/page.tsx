import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "よくある質問",
};

interface FaqItem {
  question: string;
  answer: React.ReactNode;
}

/**
 * /faq よくある質問。
 * 実装（SPEC §1〜§2.5、§9.16、src/app/api/cron/verification/logic.ts、
 * src/components/map/geo.ts、src/app/(auth)/login 等）を確認して裏付けた内容だけを書く。
 * `<details>`/`<summary>` はブラウザ標準の折りたたみで、キーボード（Tab→Enter/Space）で開閉できる。
 */
const FAQ_ITEMS: FaqItem[] = [
  {
    question: "ウラスポはどんなサービスですか",
    answer: (
      <p className="m-0">
        北海道の「まだ静かな店」を、その街に住む人が地図にピンとして残し、90日ごとに「まだ静かか」を確認し続ける
        地図サービスです。観光地化していない店の情報だけを保ち続けることを目指しています。
      </p>
    ),
  },
  {
    question: "無料ですか",
    answer: <p className="m-0">はい、無料で使えます。</p>,
  },
  {
    question: "なぜ「静かな店」だけが出るのですか",
    answer: (
      <p className="m-0">
        同じ街の2人が「行ったことがある」と答えた店だけが地図に出て、その後も90日ごとに地元の投稿者が
        「まだ静かか」を確認し続けます。混みはじめた店・観光地になった店は、検索結果の下へ静かに下がります。
      </p>
    ),
  },
  {
    question: "誰でも店を登録できますか",
    answer: (
      <p className="m-0">
        いいえ。ピンを立てられるのは、その店がある街に「住んでいる街」として設定している人だけです。
      </p>
    ),
  },
  {
    question: "住んでいる街はどうやって決まりますか",
    answer: (
      <p className="m-0">
        初めてログインしたときに表示される、街を選ぶ画面で、自分で選んで設定します。以降は
        <Link href="/me">自分のページ</Link>から変更できます。
      </p>
    ),
  },
  {
    question: "住んでいる街は変えられますか",
    answer: (
      <p className="m-0">
        変えられます。ただし90日に1回までです。直前の変更から90日以内は変更できず、次に変更できる日を画面で
        お知らせします。
      </p>
    ),
  },
  {
    question: "ログインにパスワードは要りますか",
    answer: (
      <p className="m-0">
        いりません。メールアドレスを入力すると、ログイン用のリンクが届くメールが送られます。そのリンクを開くと
        ログインできます（パスワードを設定・入力する画面はありません）。
      </p>
    ),
  },
  {
    question: "現在地はどう使われますか",
    answer: (
      <p className="m-0">
        「徒歩◯分」の表示や近い順の並び替えのために、ブラウザの位置情報機能を使うことがあります。取得した現在地
        は端末（ブラウザ）の中だけで使い、サーバーには送っていません。
      </p>
    ),
  },
  {
    question: "「徒歩10分」はどう計算していますか",
    answer: (
      <p className="m-0">分速80メートル（時速4.8キロメートルほど）を目安に、距離から歩く時間を計算しています。</p>
    ),
  },
  {
    question: "栞とは何ですか",
    answer: (
      <p className="m-0">
        気になる店を保存しておける機能です。栞に挟んだ店は<Link href="/bookmarks">栞の一覧</Link>
        から見返せます。行く予定の日時をあわせて記録することもできます。
      </p>
    ),
  },
  {
    question: "混みはじめた店はどうなりますか",
    answer: (
      <p className="m-0">
        地図・検索結果では、まだ静かな店が上に、混みはじめた店・観光地になった店はその下に表示されます
        （地図から消えるわけではありません）。
      </p>
    ),
  },
  {
    question: "確認に答えないとどうなりますか",
    answer: (
      <p className="m-0">
        店を公開している投稿者には90日ごとに確認が届きます。期限からさらに90日（合わせて約180日）答えないと、
        そのピンは地図から静かに外れます（dormant。削除はされません。後から確認に答えれば、地図に戻ります）。
      </p>
    ),
  },
  {
    question: "自分の店を載せないでほしい",
    answer: (
      <p className="m-0">
        <Link href="/shops">掲載店舗の方へ</Link>のページ、または
        <Link href="/contact">お問い合わせフォーム</Link>からご連絡ください。確認のうえ、掲載を取り下げます。
      </p>
    ),
  },
  {
    question: "情報が間違っています",
    answer: (
      <p className="m-0">
        <Link href="/contact">お問い合わせフォーム</Link>から、どの店のどの情報が間違っているかをお知らせ
        ください。
      </p>
    ),
  },
  {
    question: "対応している街はどこですか",
    answer: <p className="m-0">札幌・小樽・函館・旭川・富良野・釧路・帯広・稚内の8つの街に対応しています。</p>,
  },
  {
    question: "対応している街は増えますか",
    answer: (
      <p className="m-0">
        今後増える可能性はありますが、現時点で具体的に決まっている予定はありません。
      </p>
    ),
  },
  {
    question: "スマホアプリはありますか",
    answer: (
      <p className="m-0">
        専用のスマホアプリはありません。PC・スマホどちらのブラウザでも使えるサイトとして提供しています。
      </p>
    ),
  },
  {
    question: "広告は入りますか",
    answer: <p className="m-0">現時点では広告は入っていません。</p>,
  },
];

/**
 * details/summary は Chromium・Firefox・Safari のいずれも Tab で summary にフォーカスでき、
 * Enter / Space で開閉できるブラウザ標準の挙動を持つため、追加の JS は使わない。
 */
export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12 space-y-6">
      <header className="space-y-2">
        <h1 className="m-0" style={{ fontSize: 30 }}>
          よくある質問
        </h1>
        <p className="text-muted m-0">
          ここに無い質問は<Link href="/contact">お問い合わせフォーム</Link>からお願いします。
        </p>
      </header>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details key={item.question} className="card">
            <summary className="cursor-pointer" style={{ fontWeight: 700 }}>
              {item.question}
            </summary>
            <div className="pt-2">{item.answer}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
