"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent } from "react";
import { Button, Card, Field, Segment } from "@/components/ui";
import type { City } from "@/lib/db/types";
import { createSpotAction, type NewSpotActionState } from "@/app/actions/spot-create";
import { MapCanvas } from "@/components/map";
import type { MapPin } from "@/components/map";
import { REASON_MAX_LENGTH, VISIT_FREQUENCY_OPTIONS } from "./schema";

export interface NewSpotFormProps {
  city: City;
}

const initialState: NewSpotActionState = null;

/**
 * S5「ピンを立てる」フォーム。
 *
 * SPEC §9.14-2: 位置は `MapCanvas` のミニ地図で選ぶ。街の中心をそのまま送らせないため、
 * 利用者が地図をクリック／タップして一度も位置を選んでいない間は送信できない。
 * 緯度・経度の入力欄はキーボード・支援技術向けの代替として残し、地図のピンと双方向に同期する。
 */
export function NewSpotForm({ city }: NewSpotFormProps) {
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [visitFrequency, setVisitFrequency] = useState<string>(VISIT_FREQUENCY_OPTIONS[0].value);
  // 街の中心はあくまで地図の初期表示位置。ピンの位置（lat/lng）は
  // 利用者が地図をクリックするか、緯度・経度欄に入力するまで null のまま。
  const [lat, setLat] = useState<string>("");
  const [lng, setLng] = useState<string>("");

  const boundAction = createSpotAction.bind(null, city.slug);
  const [state, formAction, isPending] = useActionState(boundAction, initialState);

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);
  // SPEC §9.14-14: 範囲外の緯度・経度は MapLibre がエラーを投げるため、
  // 範囲内のときだけピンを生成・送信可能にする。
  const hasPosition =
    lat !== "" &&
    lng !== "" &&
    Number.isFinite(parsedLat) &&
    Number.isFinite(parsedLng) &&
    parsedLat >= -90 &&
    parsedLat <= 90 &&
    parsedLng >= -180 &&
    parsedLng <= 180;

  const pins: MapPin[] = hasPosition
    ? [{ id: "new-spot", lat: parsedLat, lng: parsedLng, quietness: "quiet", label: "ここに立てる" }]
    : [];

  const handleMapClick = ({ lat: clickedLat, lng: clickedLng }: { lat: number; lng: number }) => {
    setLat(clickedLat.toFixed(6));
    setLng(clickedLng.toFixed(6));
  };

  const handleLatChange = (event: ChangeEvent<HTMLInputElement>) => setLat(event.target.value);
  const handleLngChange = (event: ChangeEvent<HTMLInputElement>) => setLng(event.target.value);

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted text-sm">地元の人だけ / ピンを立てる</p>
        <h1 style={{ fontSize: 30 }}>まだ知られていない店を、一軒</h1>
      </div>

      <Card kicker="位置を選ぶ" title="地図をタップしてピンを置く">
        <p className="text-muted text-sm m-0">
          地図をクリック（タップ）すると、その場所にピンが立ちます。初期表示のままでは送信できません。
        </p>
        <div style={{ height: 240, borderRadius: "var(--radius-md)", overflow: "hidden" }}>
          <MapCanvas
            center={{ lat: city.centerLat, lng: city.centerLng }}
            zoom={city.defaultZoom}
            pins={pins}
            onBackgroundClick={handleMapClick}
            className="relative w-full h-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="緯度"
            name="lat"
            type="number"
            step="0.000001"
            min={-90}
            max={90}
            value={lat}
            onChange={handleLatChange}
            required
            error={state?.fieldErrors?.lat}
          />
          <Field
            label="経度"
            name="lng"
            type="number"
            step="0.000001"
            min={-180}
            max={180}
            value={lng}
            onChange={handleLngChange}
            required
            error={state?.fieldErrors?.lng}
          />
        </div>
        {!hasPosition ? (
          <p className="text-sm m-0" style={{ color: "var(--color-accent-700)" }}>
            地図で位置を選ぶか、緯度・経度を入力してください
          </p>
        ) : null}
      </Card>

      <Field
        label="店の名前"
        name="name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        error={state?.fieldErrors?.name}
      />

      <Field
        label="なぜ、あなたはここへ行くのか（60字まで）"
        name="reason"
        value={reason}
        maxLength={REASON_MAX_LENGTH}
        onChange={(event) => setReason(event.target.value)}
        required
        error={state?.fieldErrors?.reason}
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

      <Button type="submit" variant="primary" block disabled={isPending || !hasPosition}>
        ピンを立てる
      </Button>
    </form>
  );
}
