"use server";

// S5「ピンを立てる」の Server Action。
// docs/CONTRACT.md の `getCity` を信頼して import する（Task 2 が並行実装中のため、
// このファイル単体では現時点で型エラーが残る可能性がある）。

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import { getCity } from "@/lib/db/spots";
import { newSpotSchema, type NewSpotInput } from "@/components/spot-form/schema";
import { createSpot } from "@/lib/db/mutations";

export type NewSpotActionState = {
  error?: string;
  fieldErrors?: Partial<Record<keyof NewSpotInput, string>>;
} | null;

/**
 * `citySlug` を `bind` してから `useActionState` に渡す想定。
 * 例: `createSpotAction.bind(null, city.slug)`
 */
export async function createSpotAction(
  citySlug: string,
  _prevState: NewSpotActionState,
  formData: FormData,
): Promise<NewSpotActionState> {
  const userId = await getCurrentUserId();
  if (!userId) redirect(`/login?next=${encodeURIComponent(`/${citySlug}/spots/new`)}`);

  const city = await getCity(citySlug);
  if (!city) {
    return { error: "街の情報が取得できませんでした" };
  }

  const raw = {
    cityId: city.id,
    name: formData.get("name"),
    reason: formData.get("reason"),
    visitFrequency: formData.get("visitFrequency"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  };

  const parsed = newSpotSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: NonNullable<NewSpotActionState>["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string") {
        fieldErrors[key as keyof NewSpotInput] = issue.message;
      }
    }
    return { fieldErrors };
  }

  let createdId: string;
  try {
    const spot = await createSpot({ ...parsed.data, authorId: userId });
    createdId = spot.id;
  } catch (error) {
    return { error: error instanceof Error ? error.message : "スポットの作成に失敗しました" };
  }

  revalidatePath(`/${citySlug}/spots/new`);
  redirect(`/${citySlug}/spots/new?created=${createdId}`);
}
