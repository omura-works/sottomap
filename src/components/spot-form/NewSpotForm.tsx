"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Card, Field, Segment } from "@/components/ui";
import type { City } from "@/lib/db/types";
import { createSpotAction, type NewSpotActionState } from "@/app/actions/spot-create";
import { REASON_MAX_LENGTH, VISIT_FREQUENCY_OPTIONS } from "./schema";

export interface NewSpotFormProps {
  city: City;
}

const initialState: NewSpotActionState = null;

/**
 * S5「ピンを立てる」フォーム。
 *
 * 位置選択について: 本来は地図ミニプレビュー（Task 3 所有の
 * `src/components/map/MapCanvas`）で選ぶ想定（SPEC §4 S5）。実装時点で
 * MapCanvas 自体は存在するが、`import maplibregl from "maplibre-gl"`（デフォルト
 * エクスポート無し）で `npm run build` が失敗する状態だったため、これに依存すると
 * 本タスクのページごとビルドが壊れてしまう。そのため一旦、緯度・経度を直接入力する
 * フォールバックのみにしている。Task 3 側の import 修正後、MapCanvas による
 * ミニプレビューに差し替えること（詳細は task-4-report.md）。
 */
export function NewSpotForm({ city }: NewSpotFormProps) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [visitFrequency, setVisitFrequency] = useState<string>(VISIT_FREQUENCY_OPTIONS[0].value);
  const [lat, setLat] = useState(city.centerLat);
  const [lng, setLng] = useState(city.centerLng);

  const boundAction = createSpotAction.bind(null, city.slug);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const handleNumberChange = (setter: (value: number) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    const value = Number(event.target.value);
    if (!Number.isNaN(value)) setter(value);
  };

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted text-sm">地元の人だけ / ピンを立てる</p>
        <h2>まだ知られていない店を、一軒</h2>
      </div>

      <Card kicker="位置を選ぶ" title="地図でのピン選択は準備中です">
        <p className="text-muted text-sm">
          いまは緯度・経度を直接入力してください（{city.name}の中心をデフォルト値にしています）。
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="緯度"
            name="lat"
            type="number"
            step="0.000001"
            value={String(lat)}
            onChange={handleNumberChange(setLat)}
            required
          />
          <Field
            label="経度"
            name="lng"
            type="number"
            step="0.000001"
            value={String(lng)}
            onChange={handleNumberChange(setLng)}
            required
          />
        </div>
      </Card>

      <Field
        label="店の名前"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        hint={state?.fieldErrors?.name}
      />

      <Field
        label="なぜ、あなたはここへ行くのか（60字まで）"
        name="reason"
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        onChange={(event) => setReason(event.target.value)}
        required
        hint={state?.fieldErrors?.reason}
      />

      <div className="space-y-2">
        <p>正直に</p>
        <Segment
          options={[...VISIT_FREQUENCY_OPTIONS]}
          value={visitFrequency}
          onChange={setVisitFrequency}
          aria-label="行く頻度"
        />
        <input type="hidden" name="visitFrequency" value={visitFrequency} />
      </div>

      {/* SPEC §9.8: 原本の文言を一字一句そのまま実装する。 */}
      <Card kicker="立てたあと" title="このピンがどうなるか">
        <p className="m-0 text-sm">
          同じ街の2人が「行ったことがある」と答えると、地図に出ます。90日ごとに、あなたに一度だけ確認が届きます。
        </p>
      </Card>

      {state?.error ? (
        <p role="alert" className="text-sm" style={{ color: "var(--color-accent-700)" }}>
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" block disabled={isPending}>
        ピンを立てる
      </Button>
    </form>
  );
}
