// お問い合わせ（SPEC §9.17）の入力検査と、デモモード（フィクスチャ）での受け付け規則。
// DB 関数 submit_contact_message（0010）と同じ規則を再現していることを確かめる。
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FIXTURE_CONTACT_MESSAGES } from "./fixtures";
import { CONTACT_ERRORS, validateContactMessageInput } from "@/app/contact/schema";
import { purgeExpiredContactData, submitContactMessage } from "./contact";

const PUBLISHED_SPOT_ID = "d0000000-0000-4000-8000-000000000001";
/** Server Action が集めてくる送信者の情報（デモモードでは送信元は使わない）。 */
const REQUEST = { requesterId: null, userAgent: null, sourceIp: null };

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

  it("返信先: @ がちょうど1つ・空白や制御文字なし・ドメインに . を含む・320字以内だけを受け付ける", () => {
    const rejected = [
      "a@@example.com",
      "a@b@example.com",
      "a@example",
      "a b@example.com",
      "a@exa\nmple.com",
      "a\u0001@example.com",
      "a\u3000b@example.com",
      "a\u200b@example.com",
      `${"a".repeat(309)}@example.com`,
    ];
    for (const replyTo of rejected) {
      expect(() => validateContactMessageInput({ ...base, replyTo }), replyTo).toThrow(CONTACT_ERRORS.replyTo);
    }
    expect(validateContactMessageInput({ ...base, replyTo: `${"a".repeat(308)}@example.com` }).replyTo).toHaveLength(320);
    expect(validateContactMessageInput({ ...base, replyTo: "shop.owner+urasupo@example.co.jp" }).replyTo).toBe(
      "shop.owner+urasupo@example.co.jp",
    );
  });

  it("個人情報の請求（privacy）は、ログイン中（requesterId あり）か返信先があれば受け付ける（R20 重要3）", () => {
    expect(validateContactMessageInput({ ...base, category: "privacy", requesterId: "user-1" }).category).toBe(
      "privacy",
    );
    // ログインできない人・退会した人は、返信先（登録している／していたメールアドレス）を書けば送れる。
    expect(
      validateContactMessageInput({ ...base, category: "privacy", requesterId: null, replyTo: " owner@example.com " })
        .replyTo,
    ).toBe("owner@example.com");
  });

  it("個人情報の請求（privacy）は、未ログインで返信先も無ければ返信先の欄の文言で拒否する", () => {
    expect(() => validateContactMessageInput({ ...base, category: "privacy" })).toThrow(CONTACT_ERRORS.privacyReplyTo);
    expect(() =>
      validateContactMessageInput({ ...base, category: "privacy", requesterId: null, replyTo: "　 " }),
    ).toThrow(CONTACT_ERRORS.privacyReplyTo);
    // 返信先の形の誤りが先（DB 関数と同じ順序）。
    expect(() =>
      validateContactMessageInput({ ...base, category: "privacy", requesterId: null, replyTo: "a@@example.com" }),
    ).toThrow(CONTACT_ERRORS.replyTo);
    // 本文の誤りは返信先より先。
    expect(() => validateContactMessageInput({ ...base, category: "privacy", message: "" })).toThrow(
      CONTACT_ERRORS.messageEmpty,
    );
  });
});

describe("submitContactMessage（デモモード）", () => {
  it("受け付けた内容をフィクスチャに1件だけ持つ", async () => {
    const id = await submitContactMessage({
      ...REQUEST,
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
      ...REQUEST,
      category: "removal",
      message: "掲載を止めてください",
      replyTo: null,
      spotId: null,
    });
    const second = await submitContactMessage({
      ...REQUEST,
      category: "removal",
      message: "掲載を止めてください",
      replyTo: null,
      spotId: null,
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(1);
  });

  it("重複の鍵は用件・本文・対象の店・返信先・送信者。どれかが違えば別件として保存する", async () => {
    const base = { ...REQUEST, category: "removal", message: "同じ文面", replyTo: null, spotId: null };
    expect(await submitContactMessage(base)).not.toBeNull();
    expect(await submitContactMessage(base)).toBeNull();
    expect(await submitContactMessage({ ...base, spotId: PUBLISHED_SPOT_ID })).not.toBeNull();
    expect(await submitContactMessage({ ...base, replyTo: "shop@example.com" })).not.toBeNull();
    expect(await submitContactMessage({ ...base, requesterId: "b0000000-0000-4000-8000-000000000004" })).not.toBeNull();
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(4);
  });

  it("privacy は送信者を記録し、送信者も返信先も無ければ拒否する", async () => {
    await expect(
      submitContactMessage({ ...REQUEST, category: "privacy", message: "登録情報を消してください", replyTo: null, spotId: null }),
    ).rejects.toThrow(CONTACT_ERRORS.privacyReplyTo);
    const receipt = await submitContactMessage({
      ...REQUEST,
      requesterId: "b0000000-0000-4000-8000-000000000004",
      category: "privacy",
      message: "登録情報を消してください",
      replyTo: null,
      spotId: null,
    });
    expect(receipt?.category).toBe("privacy");
    expect(FIXTURE_CONTACT_MESSAGES[0].requesterId).toBe("b0000000-0000-4000-8000-000000000004");
  });

  it("privacy は未ログインでも返信先があれば受け付け、返信先を記録する（R20 重要3）", async () => {
    const receipt = await submitContactMessage({
      ...REQUEST,
      category: "privacy",
      message: "退会したので、残っている情報を消してください",
      replyTo: "former-user@example.com",
      spotId: null,
    });
    expect(receipt?.category).toBe("privacy");
    expect(FIXTURE_CONTACT_MESSAGES).toHaveLength(1);
    expect(FIXTURE_CONTACT_MESSAGES[0].requesterId).toBeNull();
    expect(FIXTURE_CONTACT_MESSAGES[0].replyTo).toBe("former-user@example.com");
  });

  it("公開中のスポットは対象にでき、存在しないスポットは拒否する", async () => {
    await expect(
      submitContactMessage({
        ...REQUEST,
        category: "correction",
        message: "住所が違います",
        replyTo: null,
        spotId: PUBLISHED_SPOT_ID,
      }),
    ).resolves.not.toBeNull();

    await expect(
      submitContactMessage({
        ...REQUEST,
        category: "correction",
        message: "存在しない店について",
        replyTo: null,
        spotId: "d0000000-0000-4000-8000-0000000000ff",
      }),
    ).rejects.toThrow(CONTACT_ERRORS.spot);
  });
});

describe("purgeExpiredContactData（デモモード）", () => {
  it("受付から1年ちょうどのものは削除し、1年に1ミリ秒足りないものは残す", async () => {
    const now = new Date("2026-09-23T00:00:00.000Z");
    const base = { category: "other" as const, message: "古い", replyTo: null, spotId: null, requesterId: null, userAgent: null, status: "new" as const };
    FIXTURE_CONTACT_MESSAGES.push(
      { ...base, id: "old", createdAt: "2025-09-23T00:00:00.000Z" },
      { ...base, id: "young", createdAt: "2025-09-23T00:00:00.001Z" },
    );

    await expect(purgeExpiredContactData(now)).resolves.toEqual({ deletedMessages: 1, deletedRates: 0 });
    expect(FIXTURE_CONTACT_MESSAGES.map((m) => m.id)).toEqual(["young"]);
  });
});
