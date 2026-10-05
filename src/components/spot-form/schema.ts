import { z } from "zod";
import type { VisitFrequency } from "@/lib/db/types";

/**
 * S5「ピンを立てる」の頻度セグメント。
 * SPEC §4 S5 / docs/design-reference/artboards.html の表記そのまま。
 */
export const VISIT_FREQUENCY_OPTIONS: Array<{ value: VisitFrequency; label: string }> = [
  { value: "weekly", label: "週1で行く" },
  { value: "monthly", label: "月1" },
  { value: "yearly", label: "年に数回" },
];

/** SPEC §4 S5「なぜ、あなたはここへ行くのか（60字まで）」の上限。 */
export const REASON_MAX_LENGTH = 60;

/**
 * 緯度・経度は空文字だと「未選択」を表す。`z.coerce.number()` は `Number("")`（=0）を
 * 有効な数値として通してしまうため、空文字は明示的に `undefined`（必須エラー）へ倒す。
 * SPEC §9.14-15: 地図のピンと緯度経度入力は同格の代替手段。
 */
const coerceOptionalNumber = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

export const POSITION_REQUIRED_ERROR = "地図で場所を選ぶか、緯度・経度を入れてください";

export const newSpotSchema = z.object({
  cityId: z.string().min(1, "街の情報が取得できませんでした"),
  name: z
    .string()
    .trim()
    .min(1, "店の名前を入力してください")
    .max(80, "店の名前は80字以内で入力してください"),
  reason: z
    .string()
    .trim()
    .min(1, "なぜここへ行くのかを入力してください")
    .max(REASON_MAX_LENGTH, `${REASON_MAX_LENGTH}字以内で入力してください`),
  visitFrequency: z.enum(["weekly", "monthly", "yearly"], {
    error: "頻度を選んでください",
  }),
  lat: z.preprocess(
    coerceOptionalNumber,
    z.coerce
      .number({ error: POSITION_REQUIRED_ERROR })
      .min(-90, "緯度は-90から90の範囲で入力してください")
      .max(90, "緯度は-90から90の範囲で入力してください"),
  ),
  lng: z.preprocess(
    coerceOptionalNumber,
    z.coerce
      .number({ error: POSITION_REQUIRED_ERROR })
      .min(-180, "経度は-180から180の範囲で入力してください")
      .max(180, "経度は-180から180の範囲で入力してください"),
  ),
});

export type NewSpotInput = z.infer<typeof newSpotSchema>;
