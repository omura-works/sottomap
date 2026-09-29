"use client";

import { useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { BrandLockup } from "@/components/brand/BrandLockup";
import { Wordmark } from "@/components/brand/Wordmark";
import {
  Envelope,
  HandLine,
  HokkaidoMap,
  LampDots,
  Lantern,
  LanternChild,
  NightAlley,
  NightRidge,
  Noren,
  PromiseArt,
  Ribbon,
  RoadLines,
  WalkPath,
} from "@/components/illustrations";
import { BounceNumber } from "@/components/motion/BounceNumber";
import { useLamp } from "@/components/motion/LampLayer";
import { PageLamp } from "@/components/motion/PageLamp";
import { Stamp } from "@/components/motion/Stamp";
import type { StampTone } from "@/components/motion/Stamp";
import { Button, Card, Chip, Dialog, Divider, Field, Input, Segment, Tag, usePrefersReducedMotion } from "@/components/ui";
import type { TagKind } from "@/components/ui";
import "./styleguide.css";

const NEUTRAL_RAMP = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const TAG_KINDS: Array<TagKind> = ["accent", "accent2", "neutral", "outline"];
const CITIES = [
  { slug: "sapporo", name: "札幌", count: 12 },
  { slug: "otaru", name: "小樽", count: 7 },
  { slug: "hakodate", name: "函館", count: 9 },
  { slug: "asahikawa", name: "旭川", count: 5 },
  { slug: "furano", name: "富良野", count: 3 },
  { slug: "kushiro", name: "釧路", count: 4 },
  { slug: "obihiro", name: "帯広", count: 6 },
  { slug: "wakkanai", name: "稚内", count: 2 },
] as const;

/** 文字の段（SPEC motion §2.2）。見本の字は画面の文言ではない（確かめる用）。 */
const TYPE_SCALE: ReadonlyArray<{ token: string; px: string; sample: string; className?: string; style: CSSProperties }> = [
  { token: "--fs-peak", px: "88 / 140", sample: "歩く", className: "fs-peak", style: { color: "var(--color-accent-600)" } },
  { token: "--fs-giant", px: "72 / 120", sample: "12", className: "fs-giant", style: { color: "var(--color-accent-600)" } },
  { token: "--fs-display", px: "40 / 72", sample: "まだ静かな店を", className: "fs-display", style: {} },
  { token: "--fs-num", px: "44 / 64", sample: "365", className: "fs-num", style: { color: "var(--color-accent-600)" } },
  { token: "--fs-h1", px: "32 / 48", sample: "h1 ページの見出し", className: "mochiy", style: { fontSize: "var(--fs-h1)", lineHeight: 1.3 } },
  { token: "--fs-h2", px: "24 / 34", sample: "h2 節の見出し", className: "mochiy", style: { fontSize: "var(--fs-h2)", lineHeight: 1.35 } },
  { token: "--fs-h3", px: "19 / 22", sample: "h3 カードの題（Zen Maru 700）", style: { fontSize: "var(--fs-h3)", fontWeight: 700, lineHeight: 1.5 } },
  { token: "--fs-lead", px: "17 / 19", sample: "リード。話しかけるような一文をここに。", className: "fs-lead", style: {} },
  { token: "--fs-body", px: "16", sample: "本文。Zen Maru Gothic 400、行間 1.9。北海道の、まだ静かな店を歩く。", style: { fontSize: "var(--fs-body)" } },
  { token: "--fs-label", px: "15", sample: "ボタン・チップ（700）", style: { fontSize: "var(--fs-label)", fontWeight: 700 } },
  { token: "--fs-small", px: "13", sample: "補助・メタ・添え字（400）", className: "fs-small", style: { color: "var(--color-text-muted)" } },
  { token: "--fs-micro", px: "12", sample: "ナビのラベル・出典・キッカー（これより小さくしない）", className: "fs-micro", style: { color: "var(--color-text-muted)" } },
];

/** 色の役割と対比（SPEC motion §2.4。比は globals-contrast.test.ts が確かめている） */
const COLOR_PAIRS: ReadonlyArray<{ name: string; fg: string; bg: string; ratio: string }> = [
  { name: "判子「静」", fg: "--color-accent-2-900", bg: "--color-accent-2-400", ratio: "7.15" },
  { name: "判子「並」", fg: "--color-accent-900", bg: "--color-accent-400", ratio: "6.93" },
  { name: "判子「観」", fg: "--color-neutral-100", bg: "--color-neutral-700", ratio: "6.02" },
  { name: "夜の主ボタン", fg: "--color-text", bg: "--color-accent-400", ratio: "7.26" },
  { name: "紙の主ボタン", fg: "--color-neutral-100", bg: "--color-accent-600", ratio: "4.97" },
  { name: "夜の上の強調", fg: "--color-accent-300", bg: "--color-neutral-900", ratio: "9.32" },
  { name: "夜の補助", fg: "--color-neutral-400", bg: "--color-neutral-900", ratio: "7.04" },
  { name: "リンク", fg: "--color-accent-700", bg: "--color-bg", ratio: "5.72" },
  { name: "付箋の本文", fg: "--color-accent-800", bg: "--color-accent-200", ratio: "8.37" },
  { name: "苔の付箋の本文", fg: "--color-accent-2-800", bg: "--color-accent-2-200", ratio: "8.11" },
];

const STAMPS: ReadonlyArray<{ glyph: string; tone: StampTone; tilt: number; label: string }> = [
  { glyph: "静", tone: "quiet", tilt: -4, label: "quiet" },
  { glyph: "並", tone: "crowding", tilt: 3, label: "crowding" },
  { glyph: "観", tone: "touristy", tilt: -2, label: "touristy" },
  { glyph: "灯", tone: "orange", tilt: 2, label: "orange" },
  { glyph: "雪", tone: "moss", tilt: -3, label: "moss" },
  { glyph: "港", tone: "night", tilt: 4, label: "night" },
];

/** `/styleguide` の本体（本番では page.tsx が notFound() で隠す）。実データを含まない。 */
export function StyleguideClient() {
  const reduced = usePrefersReducedMotion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("観光客は三角市場へ行く。地元は南樽で買う。");
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [frequency, setFrequency] = useState("weekly");
  const [selectedCity, setSelectedCity] = useState("sapporo");
  const [chips, setChips] = useState<Record<string, boolean>>({ quiet: true, day: false, cash: false, solo: true });

  const city = CITIES.find((c) => c.slug === selectedCity) ?? CITIES[0];

  return (
    <div className="styleguide mx-auto max-w-4xl px-4 py-8 lg:px-10 lg:py-14">
      <header className="sg-hero night-card">
        <RoadLines />
        <span aria-hidden="true" className="night-glow" style={{ width: 420, height: 420, right: -140, top: -180 }} />
        <LampDots count={16} ignite />
        <div className="relative">
          <div className="flex items-center">
            <PageLamp tone="night" />
            <span className="kicker-pill" data-tone="night">
              そっとマップ / スタイルガイド
            </span>
          </div>
          <h1 className="sg-hero-title">デザインシステム</h1>
          <p className="fs-display" style={{ color: "var(--color-accent-300)", margin: "0 0 16px" }}>
            灯りの地図帳
          </p>
          <p className="fs-lead" style={{ color: "var(--color-neutral-300)", maxWidth: "32em", margin: 0 }}>
            歩くたびに書き込みがふえていく地図帳に、ひとつぶの灯りがついてくる。文字の段・色・部品・7つの動詞を、ここで確かめます。
          </p>
          {reduced ? (
            <p className="sg-reduced" role="note">
              動きを減らす設定がオンなので、最終の形だけを見せています
            </p>
          ) : null}
        </div>
        <NightRidge className="sg-hero-ridge" />
      </header>

      <Section kicker="§2.2" title="文字の段（12段）" lead="1画面に「山」は1つ。山と隣の小さな字は5倍以上の差にします。">
        <ol className="sg-scale">
          {TYPE_SCALE.map((row) => (
            <li key={row.token}>
              <span className="sg-scale-meta">
                <code>{row.token}</code>
                <span>{row.px}px</span>
              </span>
              <span className={row.className} style={row.style}>
                {row.sample}
              </span>
            </li>
          ))}
        </ol>
        <div className="sg-peak-pair" aria-label="山と添え字の例">
          <span className="fs-giant" style={{ color: "var(--color-accent-600)" }}>
            12
          </span>
          <span className="fs-small" style={{ color: "var(--color-text-muted)" }}>
            軒・地元の人がたしかめて残した店
          </span>
        </div>
      </Section>

      <Section kicker="§2.4" title="色の役割と対比" lead="色は既存のトークンだけ。光るのは灯り（accent-400）だけです。">
        <ul className="sg-pairs">
          {COLOR_PAIRS.map((pair) => (
            <li key={pair.name} style={{ background: `var(${pair.bg})`, color: `var(${pair.fg})` }}>
              <span className="sg-pair-big mochiy">あ</span>
              <span className="sg-pair-name">{pair.name}</span>
              <span className="sg-pair-ratio">{pair.ratio}:1</span>
            </li>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ColorSwatch label="bg（紙）" varName="--color-bg" />
          <ColorSwatch label="neutral-100（白い紙）" varName="--color-neutral-100" />
          <ColorSwatch label="surface（砂）" varName="--color-surface" />
          <ColorSwatch label="neutral-900（夜）" varName="--color-neutral-900" dark />
        </div>
        <RampRow label="neutral" prefix="--color-neutral" />
        <RampRow label="accent" prefix="--color-accent" />
        <RampRow label="accent-2" prefix="--color-accent-2" />
      </Section>

      <Section kicker="§2.9" title="ボタン" lead="ピルの形。押した瞬間にぎゅっと沈み、離すと判子のスプリングで戻ります。">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">primary</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="ghost">ghost</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">
            札幌を歩いてみる
            <span aria-hidden="true" className="btn-arrow">
              →
            </span>
          </Button>
          <Button variant="secondary">しぼりこみをはずす</Button>
          <Button variant="ghost">この店の情報について</Button>
          <Button variant="primary" disabled>
            disabled
          </Button>
          <Button variant="secondary" icon aria-label="アイコンボタン">
            ＋
          </Button>
        </div>
        <Button variant="primary" size="lg" block>
          ピンを立てる（.btn-lg・幅いっぱい）
        </Button>
        {/* <a> に付けても文字色が <button> と同じになること（a の既定色は @layer base） */}
        <div className="flex flex-wrap items-center gap-2">
          <a href="#button-links" className="btn btn-primary">
            link primary
          </a>
          <a href="#button-links" className="btn btn-secondary">
            link secondary
          </a>
          <a href="#button-links" className="btn btn-ghost">
            link ghost
          </a>
        </div>
        <div className="night-card flex flex-wrap items-center gap-3 p-6">
          <Button variant="night">
            地図にまとめる
            <span aria-hidden="true" className="btn-arrow">
              →
            </span>
          </Button>
          <a href="#button-links" className="btn btn-on-night">
            btn-on-night
            <span aria-hidden="true" className="btn-arrow" style={{ color: "var(--color-accent-600)" }}>
              →
            </span>
          </a>
        </div>
      </Section>

      <Section kicker="§2.9" title="チップ・タグ" lead="押した位置から塗りが円で広がり、✓ が描かれます。外すと逆に閉じます。">
        <div className="flex flex-wrap" style={{ columnGap: 8 }} role="group" aria-label="しぼりこみの見本">
          {[
            ["quiet", "まだ静か"],
            ["day", "昼だけ"],
            ["cash", "現金のみ"],
            ["solo", "ひとりで入れる"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="chip-hit"
              aria-pressed={chips[key]}
              onClick={() => setChips((current) => ({ ...current, [key]: !current[key] }))}
            >
              <Chip on={Boolean(chips[key])}>{label}</Chip>
            </button>
          ))}
        </div>
        <div className="sg-sand">
          <div className="flex flex-wrap" style={{ columnGap: 8 }} role="group" aria-label="街の見本">
            {CITIES.slice(0, 4).map((c) => (
              <button key={c.slug} type="button" className="chip-hit" aria-pressed={selectedCity === c.slug} onClick={() => setSelectedCity(c.slug)}>
                <Chip on={selectedCity === c.slug} surface="sand">
                  {c.name}
                </Chip>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {TAG_KINDS.map((kind) => (
            <Tag key={kind} kind={kind}>
              {kind}
            </Tag>
          ))}
        </div>
      </Section>

      <Section kicker="§2.9" title="紙・付箋・判子・リボン" lead="足す物には意味がある物だけ。判子は静けさ、リボンは栞、付箋は短い補足。">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="sticky" data-tone="orange">
            <p className="sg-sticky-kicker">付箋 orange</p>
            <p style={{ margin: 0 }}>並と観の店は、下のほうへ静かに下がります。</p>
          </div>
          <div className="sticky" data-tone="moss" style={{ "--tilt": "1deg" } as CSSProperties}>
            <p className="sg-sticky-kicker">付箋 moss</p>
            <p style={{ margin: 0 }}>ピンを立てました！</p>
          </div>
          <div className="sticky" data-tone="night" style={{ "--tilt": "-1deg" } as CSSProperties}>
            <p className="sg-sticky-kicker" style={{ color: "var(--color-accent-300)" }}>
              付箋 night
            </p>
            <p style={{ margin: 0 }}>灯りがひとつ増えました。</p>
          </div>
        </div>
        <ul className="sg-stamps">
          {STAMPS.map((stamp) => (
            <li key={stamp.tone}>
              <Stamp glyph={stamp.glyph} tone={stamp.tone} size={56} tilt={stamp.tilt} />
              <code>{stamp.label}</code>
            </li>
          ))}
          <li>
            <Stamp glyph="受付" tone="orange" size={56} tilt={-3} />
            <code>2字</code>
          </li>
          <li>
            <span className="flex items-end gap-2">
              <Stamp glyph="静" tone="quiet" size={26} />
              <Stamp glyph="静" tone="quiet" size={30} />
              <Stamp glyph="静" tone="quiet" size={48} />
              <Stamp glyph="静" tone="quiet" size={72} />
            </span>
            <code>26 / 30 / 48 / 72</code>
          </li>
        </ul>
        <div className="grid gap-6 sm:grid-cols-2">
          <Card kicker="海鮮丼 / 北24条" title="シハチ鮮魚店 北24条店" meta="徒歩7分・地元3人が確認" className="relative">
            <span className="tape" style={{ top: -9, left: 24 }} />
            魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。
          </Card>
          <div className="sg-ribbon-card card">
            <span className="sg-ribbon-box">
              <Ribbon width={24} height={72} />
            </span>
            <p className="card-kicker" style={{ margin: 0 }}>
              リボン・キッカーの札
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="kicker-pill">地元の人だけ</span>
              <span className="kicker-pill" data-tone="moss">
                ピンを立てる
              </span>
            </div>
          </div>
        </div>
      </Section>

      <Section kicker="§2.9" title="ワードマーク" lead="「そっと」は墨、「マップ」は橙。ロゴの点が、サイト中を渡る灯りになります。">
        <div className="flex flex-wrap items-center gap-6">
          <BrandLockup />
          <Wordmark size={40} />
        </div>
        <div className="night-card flex flex-wrap items-center gap-6 p-6">
          <BrandLockup tone="night" size={24} />
          <Wordmark tone="night" size={40} />
        </div>
      </Section>

      <Section kicker="§1.2・§3.3" title="7つの動詞" lead="昼は描く・貼る・押す・挟む・跳ねる。夜は灯る・渡る。これ以外の動きは作りません。">
        <div className="sg-verbs">
          <VerbDemo name="描く" note="線が紙の上に引かれていく（700ms）">
            <div className="sg-draw">
              <span className="sg-draw-word mochiy">
                静かな
                <HandLine variant="underline" draw className="sg-draw-underline" color="var(--color-accent-500)" />
              </span>
              <HandLine variant="hanamaru" draw delay={300} className="sg-hanamaru" color="var(--color-accent-600)" />
            </div>
          </VerbDemo>
          <VerbDemo name="貼る" note="少し上から置かれ、ぴたっと止まる（--spring-settle 600ms）">
            <div className="sticky verb-stick" data-tone="orange" style={{ "--tilt": "-1.5deg" } as CSSProperties}>
              <p style={{ margin: 0 }}>今週、地元の人がたしかめた店</p>
            </div>
          </VerbDemo>
          <VerbDemo name="押す" note="判子がぎゅっと押され、インクの輪がにじむ（480ms）">
            <div className="flex items-center gap-4">
              {STAMPS.slice(0, 3).map((stamp, i) => (
                <Stamp
                  key={stamp.tone}
                  glyph={stamp.glyph}
                  tone={stamp.tone}
                  size={56}
                  tilt={stamp.tilt}
                  animate="press"
                  style={{ "--d": `${i * 120}ms` } as CSSProperties}
                />
              ))}
            </div>
          </VerbDemo>
          <VerbDemo name="挟む" note="リボンがすき間にするりと入り、一度ゆれる（700ms＋900ms）">
            <div className="sg-tuck card">
              <span className="sg-ribbon-box">
                <Ribbon width={24} height={72} className="verb-tuck" />
              </span>
              <p className="card-title" style={{ margin: 0 }}>
                北24条の小さな喫茶店
              </p>
              <p className="fs-small" style={{ margin: 0, color: "var(--color-text-muted)" }}>
                栞に挟みました。
              </p>
            </div>
          </VerbDemo>
          <VerbDemo name="跳ねる" note="大きな字・数字がぽよんと弾んで止まる（--spring-pop 800ms）">
            <div className="flex items-end gap-4">
              <span className="fs-giant" style={{ color: "var(--color-accent-600)", display: "inline-flex" }}>
                <span className="verb-pop" style={{ display: "inline-block" }}>
                  歩
                </span>
                <span className="verb-pop" style={{ display: "inline-block", "--d": "60ms" } as CSSProperties}>
                  く
                </span>
              </span>
            </div>
          </VerbDemo>
          <VerbDemo name="灯る" note="芯の点がつき、光がふわっと広がる（北から南へ）" night>
            <div className="sg-ignite">
              <LampDots count={16} ignite />
              <Lantern size={52} lit className="sg-ignite-lantern" />
            </div>
          </VerbDemo>
        </div>
        <FlyDemo />
      </Section>

      <Section kicker="§2.3・§2.10.1" title="数字と、北海道の小さな地図" lead="街を選ぶと、灯りが前の街から次の街へ渡り、件数が回って跳ねます。">
        <div className="sg-map-card card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="mochiy" style={{ fontSize: 22, lineHeight: 1.35, margin: 0 }}>
                どの街を歩く？
              </p>
              <p className="sg-count">
                <span className="fs-num" style={{ color: "var(--color-accent-600)" }}>
                  <BounceNumber value={city.count} />
                </span>
                <span className="mochiy" style={{ fontSize: 22 }}>
                  軒
                </span>
              </p>
              <p className="fs-small" style={{ margin: 0, color: "var(--color-text-muted)" }}>
                {city.name}で、地元の人がたしかめて残した店の数です。
              </p>
            </div>
            <HokkaidoMap selectedSlug={selectedCity} ignite />
          </div>
          <div className="flex flex-wrap" style={{ columnGap: 8, marginTop: 12 }} role="group" aria-label="街を選ぶ（見本）">
            {CITIES.map((c) => (
              <button key={c.slug} type="button" className="chip-hit" aria-pressed={selectedCity === c.slug} onClick={() => setSelectedCity(c.slug)}>
                <Chip on={selectedCity === c.slug} surface="sand">
                  {c.name}
                </Chip>
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section kicker="§2.10" title="挿絵と模様" lead="すべて飾り（読み上げない・押せない）。">
        <div className="sg-art">
          <figure>
            <div className="sg-art-box">
              <LanternChild size={56} />
              <LanternChild size={40} look="around" />
            </div>
            <figcaption>LanternChild（front / around）</figcaption>
          </figure>
          <figure>
            <div className="sg-art-box">
              <Lantern size={52} tone="paper" lit />
              <Lantern size={52} tone="paper" />
            </div>
            <figcaption>Lantern（灯る / 消灯）</figcaption>
          </figure>
          <figure>
            <div className="sg-art-box">
              <Noren width={140} />
            </div>
            <figcaption>Noren</figcaption>
          </figure>
          <figure>
            <div className="sg-art-box">
              <Envelope width={64} />
              <PromiseArt kind="pin" />
              <PromiseArt kind="faces" />
              <PromiseArt kind="calendar" />
            </div>
            <figcaption>Envelope・やくそくの挿絵3つ</figcaption>
          </figure>
          <figure>
            <div className="sg-art-box">
              <WalkPath d="M8 40 C 60 40, 90 10, 150 16 S 240 44, 290 20" viewBox="0 0 300 56" draw style={{ width: "100%", height: 56 }} />
            </div>
            <figcaption>WalkPath（散歩道の点線）</figcaption>
          </figure>
          <figure>
            <NightAlley ignite className="sg-alley">
              <span className="sg-alley-note">写真は、まだありません</span>
            </NightAlley>
            <figcaption>NightAlley</figcaption>
          </figure>
        </div>
      </Section>

      <Divider />

      <Section kicker="既存" title="Card" lead="白い紙・細線の枠・角丸 22px・紙の影。">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card kicker="海鮮丼 / 北24条" title="シハチ鮮魚店 北24条店" meta="徒歩7分・地元3人が確認" elevation="sm">
            魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。
          </Card>
          <Card kicker="カード" title="elevation=lg" elevation="lg">
            elev-lg のシャドウ確認用カード。
          </Card>
        </div>
      </Section>

      <Section kicker="既存" title="Input / Field" lead="入力欄は高さ 48px・角丸 14px・枠 1.5px。検索欄だけ、フォーカスで手描きの下線が引かれます。">
        <Input underline placeholder="札幌の店をさがす" aria-label="札幌の店をさがす（見本）" />
        <Field
          label="なぜ、あなたはここへ行くのか（60字まで）"
          maxLength={60}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          description="正直な理由を一言で。"
        />
      </Section>

      <Section kicker="既存" title="Segment" lead="ふだんは塗り。ピンを立てる画面の「頻度」だけ、手描きの丸で囲みます。">
        <Segment
          aria-label="歩きかたを選ぶ"
          value={timeOfDay}
          onChange={setTimeOfDay}
          options={[
            { value: "day", label: "昼" },
            { value: "night", label: "夜" },
            { value: "morning", label: "朝" },
          ]}
        />
        <Segment
          aria-label="行く頻度"
          variant="circle"
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: "weekly", label: "週1で行く" },
            { value: "monthly", label: "月1" },
            { value: "yearly", label: "年に数回" },
          ]}
        />
      </Section>

      <Section kicker="§5.17" title="Dialog" lead="開くとき、下から少し持ち上がって置かれます（閉じるときは即座）。">
        <Button variant="secondary" onClick={() => setDialogOpen(true)}>
          ダイアログを開く
        </Button>
        <Dialog
          open={dialogOpen}
          title="この店は、まだ隠れていますか"
          onClose={() => setDialogOpen(false)}
          actions={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                閉じる
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                静かなまま
              </Button>
            </>
          }
        >
          スタイルガイド確認用のダイアログ本文です。
        </Dialog>
      </Section>
    </div>
  );
}

function Section({ kicker, title, lead, children }: { kicker: string; title: string; lead: string; children: ReactNode }) {
  return (
    <section className="sg-section">
      <p className="sg-kicker">{kicker}</p>
      <h2>{title}</h2>
      <p className="sg-lead">{lead}</p>
      <div className="sg-body">{children}</div>
    </section>
  );
}

/** 動詞の見本。「もう一度再生」で key を変えて部品を作り直し、動きを最初から見せる。 */
function VerbDemo({ name, note, night = false, children }: { name: string; note: string; night?: boolean; children: ReactNode }) {
  const [run, setRun] = useState(0);
  return (
    <div className={night ? "sg-verb night-card" : "sg-verb"}>
      <div className="sg-verb-head">
        <p className="sg-verb-name mochiy">{name}</p>
        <Button variant={night ? "night" : "secondary"} onClick={() => setRun((n) => n + 1)} aria-label={`${name}をもう一度再生`}>
          もう一度再生
        </Button>
      </div>
      <p className="sg-verb-note">{note}</p>
      <div className="sg-verb-stage" key={run}>
        {children}
      </div>
    </div>
  );
}

/** 渡る: ボタンから別の丸へ灯り（とリボン・判子）を飛ばし、着いた丸を弾ませる。 */
function FlyDemo() {
  const lamp = useLamp();
  const targetRef = useRef<HTMLSpanElement>(null);
  const [arrived, setArrived] = useState(0);

  const fly = (kind: "lamp" | "ribbon" | "stamp", origin: HTMLElement) => {
    const target = targetRef.current;
    if (!target) return;
    lamp.fly(origin, target, {
      kind,
      glyph: "静",
      tone: "quiet",
      onArrive: () => {
        lamp.bump(target);
        setArrived((n) => n + 1);
      },
    });
  };

  return (
    <div className="sg-fly night-card">
      <div className="sg-verb-head">
        <p className="sg-verb-name mochiy">渡る</p>
      </div>
      <p className="sg-verb-note">灯りが弧を描いて別の場所へ移る（520ms、灯りの層）。着いた丸が1回弾みます。</p>
      <div className="sg-fly-row">
        <div className="flex flex-wrap gap-2">
          <Button variant="night" onClick={(event) => fly("lamp", event.currentTarget)}>
            灯りを飛ばす
          </Button>
          <Button variant="night" onClick={(event) => fly("ribbon", event.currentTarget)}>
            リボンを飛ばす
          </Button>
          <Button variant="night" onClick={(event) => fly("stamp", event.currentTarget)}>
            判子を飛ばす
          </Button>
        </div>
        <span className="sg-fly-target" ref={targetRef}>
          <span className="mochiy" aria-hidden="true">
            栞
          </span>
        </span>
      </div>
      <p className="sg-verb-note">
        着いた回数: {arrived}
      </p>
    </div>
  );
}

function ColorSwatch({ label, varName, dark = false }: { label: string; varName: string; dark?: boolean }) {
  return (
    <div className="overflow-hidden rounded-md border" style={{ borderColor: "var(--color-divider)" }}>
      <div className="h-14" style={{ background: `var(${varName})` }} />
      <div
        className="px-2 py-1 text-xs"
        style={{ color: dark ? "var(--color-neutral-100)" : "var(--color-text)", background: dark ? "var(--color-neutral-800)" : "var(--color-surface)" }}
      >
        {label}
      </div>
    </div>
  );
}

function RampRow({ label, prefix }: { label: string; prefix: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted" style={{ margin: 0 }}>
        {label} 100→900
      </p>
      <div className="flex overflow-hidden rounded-md">
        {NEUTRAL_RAMP.map((step) => (
          <div key={step} className="h-8 flex-1" style={{ background: `var(${prefix}-${step})` }} title={`${prefix}-${step}`} />
        ))}
      </div>
    </div>
  );
}
