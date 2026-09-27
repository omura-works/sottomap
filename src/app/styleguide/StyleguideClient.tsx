"use client";

import { useState } from "react";
import { Button, Card, Dialog, Divider, Field, Input, Segment, Tag } from "@/components/ui";
import type { TagKind } from "@/components/ui";

const NEUTRAL_RAMP = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const TAG_KINDS: Array<TagKind> = ["accent", "accent2", "neutral", "outline"];
const CITY_CHIPS = [
  { slug: "sapporo", name: "札幌" },
  { slug: "otaru", name: "小樽" },
  { slug: "hakodate", name: "函館" },
] as const;

/** `/styleguide` の本体（本番では page.tsx が notFound() で隠す）。実データを含まない。 */
export function StyleguideClient() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("観光客は三角市場へ行く。地元は南樽で買う。");
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [selectedCity, setSelectedCity] = useState("sapporo");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 lg:py-12 space-y-10">
      <header className="space-y-2">
        <p className="text-muted text-sm">そっとマップ / スタイルガイド</p>
        <h1>デザインシステム</h1>
        <p className="text-muted">
          UIコンポーネントの一覧（2026-09-26「落ち着いた上品なデザイン」の規則）。橙は主ボタン・選択中・ピンだけ。操作部品は高さ44px・角丸10px、カードは細線の枠・角丸14px、チップは丸い細線。
        </p>
      </header>

      <Divider />

      <section className="space-y-3">
        <h2>タイポグラフィ</h2>
        <h1>h1 見出し 400 / 28〜38px・字間 0.07em</h1>
        <h2>h2 見出し 500 / 22〜26px・字間 0.05em</h2>
        <h3>h3 見出し 500 / 19px</h3>
        <h4>h4 見出し 500 / 17px</h4>
        <p>本文テキスト。Zen Maru Gothic 400（行間 1.85・字間 0.025em）。書体はこれ1つで、階層は太さと字間で作る。北海道の、まだ静かな店を歩く。</p>
        <p className="text-xs text-muted">小さな文字（11〜13px の補助・ラベル）は 500。ボタン・ナビ・チップも 500。</p>
        <p className="text-muted">text-muted の例。地元がまだ静かだと答えた店だけです。</p>
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>カラー</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <ColorSwatch label="bg" varName="--color-bg" />
          <ColorSwatch label="surface" varName="--color-surface" />
          <ColorSwatch label="text" varName="--color-text" dark />
          <ColorSwatch label="text-muted" varName="--color-text-muted" dark />
          <ColorSwatch label="accent" varName="--color-accent" dark />
          <ColorSwatch label="accent-2" varName="--color-accent-2" dark />
        </div>
        <RampRow label="neutral" prefix="--color-neutral" />
        <RampRow label="accent" prefix="--color-accent" />
        <RampRow label="accent-2" prefix="--color-accent-2" />
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>Button</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">primary</Button>
          <Button variant="secondary">secondary</Button>
          <Button variant="ghost">ghost</Button>
          <Button variant="primary" disabled>
            disabled
          </Button>
          <Button variant="secondary" icon aria-label="アイコンボタン">
            ＋
          </Button>
        </div>
        <Button variant="primary" block>
          block button
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
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>Tag</h2>
        <div className="flex flex-wrap gap-2">
          {TAG_KINDS.map((kind) => (
            <Tag key={kind} kind={kind}>
              {kind}
            </Tag>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {CITY_CHIPS.map((city) => (
            <Tag
              key={city.slug}
              as="button"
              kind={selectedCity === city.slug ? "accent" : "outline"}
              selected={selectedCity === city.slug}
              onClick={() => setSelectedCity(city.slug)}
            >
              {city.name}
            </Tag>
          ))}
        </div>
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>Card</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card kicker="海鮮丼 / 北24条" title="シハチ鮮魚店 北24条店" meta="徒歩7分・地元3人が確認" elevation="sm">
            魚屋の直営。地元の値段のまま、海鮮丼になって出てくる。
          </Card>
          <Card kicker="カード" title="elevation=lg" elevation="lg">
            elev-lg のシャドウ確認用カード。
          </Card>
        </div>
        {/* 夜のカード（トップのヒーロー・栞の見出し・灯りのバッジと共通の .night-card） */}
        <div className="night-card flex flex-col gap-4 p-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <span className="night-glow" style={{ width: 280, height: 280, right: -80, top: -110 }} />
            <span className="night-light" style={{ width: 5, height: 5, right: 120, top: 32 }} />
          </div>
          <p className="relative" style={{ margin: 0, color: "var(--color-neutral-400)", fontSize: 14 }}>
            night-card / btn-on-night
          </p>
          <div className="relative flex flex-wrap gap-3">
            <a href="#button-links" className="btn btn-on-night">
              btn-on-night
              <span aria-hidden="true" style={{ color: "var(--color-accent-600)" }}>
                →
              </span>
            </a>
          </div>
        </div>
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>Input / Field</h2>
        <Input placeholder="札幌の店をさがす" />
        <Field
          label="なぜ、あなたはここへ行くのか（60字まで）"
          maxLength={60}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          description="正直な理由を一言で。"
        />
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>Segment</h2>
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
      </section>

      <Divider />

      <section className="space-y-3">
        <h2>Dialog</h2>
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
      </section>
    </div>
  );
}

function ColorSwatch({ label, varName, dark = false }: { label: string; varName: string; dark?: boolean }) {
  return (
    <div className="rounded-md overflow-hidden border" style={{ borderColor: "var(--color-divider)" }}>
      <div className="h-14" style={{ background: `var(${varName})` }} />
      <div className="px-2 py-1 text-xs" style={{ color: dark ? "var(--color-bg)" : "var(--color-text)", background: "var(--color-surface)" }}>
        {label}
      </div>
    </div>
  );
}

function RampRow({ label, prefix }: { label: string; prefix: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted">{label} 100→900</p>
      <div className="flex overflow-hidden rounded-md">
        {NEUTRAL_RAMP.map((step) => (
          <div key={step} className="h-8 flex-1" style={{ background: `var(${prefix}-${step})` }} title={`${prefix}-${step}`} />
        ))}
      </div>
    </div>
  );
}
