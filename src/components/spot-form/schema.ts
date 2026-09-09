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
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export type NewSpotInput = z.infer<typeof newSpotSchema>;
