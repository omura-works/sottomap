// お問い合わせ（SPEC §9.17）の入力検査と、デモモード（フィクスチャ）での受け付け規則。
// DB 関数 submit_contact_message（0009）と同じ規則を再現していることを確かめる。
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FIXTURE_CONTACT_MESSAGES } from "./fixtures";
import { CONTACT_ERRORS, validateContactMessageInput } from "@/app/contact/schema";
import { submitContactMessage } from "./contact";

const PUBLISHED_SPOT_ID = "d0000000-0000-4000-8000-000000000001";

beforeAll(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
});

afterEach(() => {
  FIXTURE_CONTACT_MESSAGES.length = 0;
});

describe("validateContactMessageInput", () => {
  const base = { category: "removal", message: "この店の掲載を止めてください。", replyTo: null, spotId: null };

  it("用件が選ばれていなければ拒否する", () => {
    expect(() => validateContactMessageInput({ ...base, category: null })).toThrow(CONTACT_ERRORS.category);
    expect(() => validateContactMessageInput({ ...base, category: "spam" })).toThrow(CONTACT_ERRORS.category);
  });

  it("本文が空・空白だけなら拒否する", () => {
    expect(() => validateContactMessageInput({ ...base, message: "" })).toThrow(CONTACT_ERRORS.messageEmpty);
    expect(() => validateContactMessageInput({ ...base, message: "　 \n" })).toThrow(CONTACT_ERRORS.messageEmpty);
  });

  it("本文は2000字まで受け取り、2001字は拒否する", () => {
    expect(validateContactMessageInput({ ...base, message: "あ".repeat(2000) }).message).toHaveLength(2000);
    expect(() => validateContactMessageInput({ ...base, message: "あ".repeat(2001) })).toThrow(
      CONTACT_ERRORS.messageTooLong,
    );
  });

  it("返信先は空なら null、形が違えば拒否する", () => {
    expect(validateContactMessageInput({ ...base, replyTo: "  " }).replyTo).toBeNull();
    expect(validateContactMessageInput({ ...base, replyTo: " a@example.com " }).replyTo).toBe("a@example.com");
    expect(() => validateContactMessageInput({ ...base, replyTo: "example.com" })).toThrow(CONTACT_ERRORS.replyTo);
    expect(() => validateContactMessageInput({ ...base, replyTo: "@example.com" })).toThrow(CONTACT_ERRORS.replyTo);
    expect(() => validateContactMessageInput({ ...base, replyTo: "a@" })).toThrow(CONTACT_ERRORS.replyTo);
    expect(() => validateContactMessageInput({ ...base, replyTo: `${"a".repeat(320)}@example.com` })).toThrow(
      CONTACT_ERRORS.replyTo,
    );
  });
});

describe("submitContactMessage（デモモード）", () => {
  it("受け付けた内容をフィクスチャに1件だけ持つ", async () => {
    const id = await submitContactMessage({
      category: "other",
      message: "地図の使い方について",
      replyTo: "a@example.com",
      spotId: null,
    });
    expect(id).not.toBeNull();
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(1);
    expect(FIXTURE_CONTACT_MESSAGES[0].status).toBe("new");
  });

  it("直近1分以内の同じ内容は保存せず null を返す（二重送信）", async () => {
    const first = await submitContactMessage({
      category: "removal",
      message: "掲載を止めてください",
      replyTo: null,
      spotId: null,
    });
    const second = await submitContactMessage({
      category: "removal",
      message: "掲載を止めてください",
      replyTo: null,
      spotId: null,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(1);
  });

  it("公開中のスポットは対象にでき、存在しないスポットは拒否する", async () => {
    await expect(
      submitContactMessage({
        category: "correction",
        message: "住所が違います",
        replyTo: null,
        spotId: PUBLISHED_SPOT_ID,
      }),
    ).resolves.not.toBeNull();

    await expect(
      submitContactMessage({
        category: "correction",
        message: "存在しない店について",
        replyTo: null,
        spotId: "d0000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toThrow(CONTACT_ERRORS.spot);
  });
});
