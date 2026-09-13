"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Segment, Tag } from "@/components/ui";
import { Disclaimer } from "@/components/profile/Disclaimer";
import { saveHomeCityAction } from "@/app/actions/start";

export interface StartCityOption {
  slug: string;
  name: string;
}

export interface StartRecentlyVerifiedItem {
  spotId: string;
  spotName: string;
  verifierCount: number;
}

export interface StartCityData {
  publishedCount: number;
  recentlyVerified: StartRecentlyVerifiedItem[];
}

const TIME_OF_DAY_OPTIONS = [
  { value: "day", label: "昼" },
  { value: "night", label: "夜" },
  { value: "morning", label: "朝" },
];

/**
 * S1「街を選ぶ」のインタラクティブ部分。
 * 街ごとの実データ（公開ピン数・今週確認された店）はサーバー側で事前に
 * 8街ぶんまとめて取得し（`page.tsx`）、街チップの切り替えは追加の通信なしで
 * 即座に切り替わるようにしている。
 */
export function StartScreen({
  cities,
  dataBySlug,
  defaultCitySlug,
}: {
  cities: StartCityOption[];
  dataBySlug: Record<string, StartCityData>;
  defaultCitySlug: string;
}) {
  const router = useRouter();
  const [selectedSlug, setSelectedSlug] = useState(defaultCitySlug);
  const [timeOfDay, setTimeOfDay] = useState("day");
  const [isStarting, startTransition] = useTransition();

  const selectedCity = useMemo(
    () => cities.find((city) => city.slug === selectedSlug) ?? cities[0],
    [cities, selectedSlug],
  );
  const selectedData = dataBySlug[selectedSlug] ?? { publishedCount: 0, recentlyVerified: [] };

  return (
    <div
      className="mx-auto max-w-xl px-4 pt-8 lg:pt-14 space-y-8"
      // SPEC §9.12-2: /start はチロム（下部タブ）を持たないフルスクリーン導線だが、
      // モバイル端末のホームインジケータ等に末尾の注記が隠れないよう、
      // 下部タブ1つぶんに相当する余白を安全域(env(safe-area-inset-bottom))込みで確保する。
      style={{ paddingBottom: "calc(4rem + env(safe-area-inset-bottom))" }}
    >
      <header className="space-y-2">
        <p className="text-muted text-xs tracking-wide uppercase">ウラスポ</p>
        {/* SPEC §9.12-3: 原本 S1 の見出しは h2 相当(30px/900)。§4 の h1 既定はそのままに、
            この画面だけインラインスタイルでサイズを合わせる（グローバルな h1 定義は変えない）。 */}
        <h1 style={{ fontSize: 30 }}>どの街を歩きますか</h1>
        <p className="text-muted">住んでいる人が残した店だけを見せます。まだ静かなところから。</p>
      </header>

      <section aria-label="街を選ぶ" className="flex flex-wrap gap-2">
        {cities.map((city) => (
          <Tag
            key={city.slug}
            as="button"
            kind={city.slug === selectedSlug ? "accent" : "outline"}
            selected={city.slug === selectedSlug}
            onClick={() => setSelectedSlug(city.slug)}
          >
            {city.name}
          </Tag>
        ))}
      </section>

      <section className="space-y-2">
        <p className="text-sm text-muted">歩きかたを選ぶ</p>
        <Segment aria-label="歩きかたを選ぶ" value={timeOfDay} onChange={setTimeOfDay} options={TIME_OF_DAY_OPTIONS} />
      </section>

      <section className="space-y-3">
        <h3>今週、静けさが確認された店</h3>
        {selectedData.recentlyVerified.length > 0 ? (
          <ul className="space-y-2">
            {selectedData.recentlyVerified.map((item) => (
              <li
                key={item.spotId}
                className="flex items-center justify-between rounded-md px-3 py-2"
                style={{ background: "var(--color-surface)" }}
              >
                <span>{item.spotName}</span>
                <span className="text-muted text-sm">{item.verifierCount}人</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted text-sm">今週はまだ確認がありません。</p>
        )}
      </section>

      <footer className="space-y-4">
        <p className="text-muted text-sm">
          {selectedCity.name}には、地元が確認したピンが{selectedData.publishedCount}件あります。
        </p>
        <Button
          variant="primary"
          block
          disabled={isStarting}
          onClick={() => {
            startTransition(async () => {
              await saveHomeCityAction(selectedSlug);
              router.push(`/${selectedSlug}`);
            });
          }}
        >
          歩きはじめる
        </Button>
        <Disclaimer />
      </footer>
    </div>
  );
}
