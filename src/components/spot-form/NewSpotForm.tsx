"use client";

import { useActionState, useState } from "react";
import type { ChangeEvent, CSSProperties } from "react";
import { Button, Card, Field, Segment } from "@/components/ui";
import { HandLine } from "@/components/illustrations/HandLine";
import { Lantern } from "@/components/illustrations/Lantern";
import { PromiseArt } from "@/components/illustrations/PromiseArt";
import { Reveal } from "@/components/motion/Reveal";
import type { City } from "@/lib/db/types";
import { createSpotAction, type NewSpotActionState } from "@/app/actions/spot-create";
import { MapCanvas } from "@/components/map";
import type { MapPin } from "@/components/map";
import { POSITION_REQUIRED_ERROR, REASON_MAX_LENGTH, VISIT_FREQUENCY_OPTIONS } from "./schema";
import { PageLamp } from "@/components/motion/PageLamp";

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
  // 地図をタップした回数。置き直すたびにピンの判子をもう一度押し、緯度・経度の欄を一度だけ明るくする
  // （手で緯度・経度を入れたときは変えない）。SPEC motion §5.8・§10.2-3。
  const [tapCount, setTapCount] = useState(0);

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
    ? [{ id: "new-spot", lat: parsedLat, lng: parsedLng, quietness: "quiet", label: "ここに立てる", stampKey: String(tapCount) }]
    : [];
  // 3段の提灯: 位置が選ばれた・店の名前が入った（空白だけは数えない）・理由が入った
  const steps = [hasPosition, name.trim() !== "", reason.trim() !== ""];

  const handleMapClick = ({ lat: clickedLat, lng: clickedLng }: { lat: number; lng: number }) => {
    setLat(clickedLat.toFixed(6));
    setLng(clickedLng.toFixed(6));
    setTapCount((count) => count + 1);
  };

  const handleLatChange = (event: ChangeEvent<HTMLInputElement>) => setLat(event.target.value);
  const handleLngChange = (event: ChangeEvent<HTMLInputElement>) => setLng(event.target.value);

  return (
    <form action={formAction} className="new-spot">
      <header className="new-spot-head">
        <p className="verify-kickers">
          <PageLamp />
          <span className="kicker-pill">地元の人だけ</span>
          <span className="kicker-pill" data-tone="moss">
            ピンを立てる
          </span>
        </p>
        <div className="new-spot-title-row">
          <h1 className="new-spot-title">
            まだ知られていない店を、
            <span className="new-spot-ikken">
              一軒
              <HandLine variant="underline" strokeWidth={5} draw delay={200} className="new-spot-ikken-line" />
            </span>
          </h1>
          {/* 3段の提灯（位置・名前・理由）。そろった段の光が灯る。飾りなので読み上げない */}
          <span className="new-spot-lanterns" aria-hidden="true">
            {steps.map((lit, i) => (
              <Lantern key={i} size={36} lit={lit} tone="paper" />
            ))}
          </span>
        </div>
        <p className="new-spot-lead">あなたがふだん通っている、あの店を教えてください。</p>
      </header>

      <Card kicker="位置を選ぶ" title="地図をタップして、ピンを置いてね" className="new-spot-position">
        <p className="new-spot-position-text">
          地図をクリック（タップ）した場所にピンが立ちます。一度も置かないままだと、送れません。
        </p>
        <div className="new-spot-map">
          <MapCanvas
            center={{ lat: city.centerLat, lng: city.centerLng }}
            zoom={city.defaultZoom}
            pins={pins}
            onBackgroundClick={handleMapClick}
            className="relative w-full h-full"
          />
        </div>
        {/* 地図をタップするたびに、緯度・経度の欄の地が一度だけ明るくなって戻る（包みを描き直して動きを再生する） */}
        <div key={tapCount} className="new-spot-coords grid grid-cols-2 gap-3" data-flash={tapCount > 0 ? "true" : "false"}>
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
          <p className="inline-alert new-spot-position-note">
            <Lantern size={16} tone="paper" />
            {POSITION_REQUIRED_ERROR}
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
        description="ひとことで大丈夫です。"
        onChange={(event) => setReason(event.target.value)}
        required
        error={state?.fieldErrors?.reason}
      />

      <div className="new-spot-frequency">
        <p className="new-spot-frequency-title">正直に、どのくらい行きますか？</p>
        <Segment
          options={[...VISIT_FREQUENCY_OPTIONS]}
          value={visitFrequency}
          onChange={setVisitFrequency}
          variant="circle"
          aria-label="行く頻度"
        />
        <input type="hidden" name="visitFrequency" value={visitFrequency} />
      </div>

      {/* SPEC §9.8: 原本の文言を一字一句そのまま実装する。 */}
      <Reveal verb="stick" style={{ "--tilt": "0deg" } as CSSProperties}>
        <Card kicker="立てたあと" title="このピンがどうなるか" className="new-spot-after">
          <PromiseArt kind="faces" size={48} className="new-spot-after-art" />
          <p className="m-0 text-sm">
            同じ街の2人が「行ったことがある」と答えると、地図に出ます。90日ごとに、あなたに一度だけ確認が届きます。
          </p>
        </Card>
      </Reveal>

      {state?.error ? (
        <p role="alert" className="inline-alert alert-in text-sm">
          <Lantern size={16} tone="paper" />
          {state.error}
        </p>
      ) : null}

      <div>
        <Button type="submit" variant="primary" size="lg" block disabled={isPending || !hasPosition}>
          ピンを立てる
        </Button>
        <p className="search-pending new-spot-pending" data-on={isPending ? "true" : "false"}>
          {isPending ? (
            <>
              <span className="search-pending-lamp" aria-hidden="true" />
              立てています…
            </>
          ) : null}
        </p>
      </div>
    </form>
  );
}
