import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUserId } from "@/lib/auth";
import { addBookmark, answerVerification, endorseSpot as persistEndorsement } from "@/lib/db/mutations";
import { redirect } from "next/navigation";
import { addBookmarkAction } from "./bookmark-actions";
import { createSpotAction } from "./spot-create";
import { endorseSpot } from "./spot-endorse";
import { submitVerification } from "./spot-verify";

vi.mock("@/lib/auth", () => ({ getCurrentUserId: vi.fn() }));
vi.mock("@/lib/db/mutations", () => ({
  addBookmark: vi.fn(),
  removeBookmark: vi.fn(),
  createSpot: vi.fn(),
  endorseSpot: vi.fn(),
  answerVerification: vi.fn(),
}));
vi.mock("@/lib/db/spots", () => ({
  getCity: vi.fn().mockResolvedValue({ id: "city-1" }),
  getSpot: vi.fn().mockResolvedValue({
    id: "spot-1",
    authorId: "author-1",
    status: "pending",
    endorsementCount: 0,
  }),
  getProfileStats: vi.fn(),
  getUserProfile: vi.fn(),
  getVerificationRequest: vi.fn(),
  listSpotsByAuthor: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

describe("Server Action の認証境界", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUserId).mockResolvedValue(null);
  });

  it("未ログインでは栞追加を行わずログインへ遷移する", async () => {
    await expect(addBookmarkAction("spot-1")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fbookmarks");
    expect(addBookmark).not.toHaveBeenCalled();
  });

  it("未ログインではスポット作成を行わずログインへ遷移する", async () => {
    await expect(createSpotAction("sapporo", null, new FormData())).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fsapporo%2Fspots%2Fnew");
  });

  it("未ログインでは承認を記録せずログインへ遷移する", async () => {
    await expect(endorseSpot("spot-1", "sapporo")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fsapporo%2Fspots%2Fnew");
    expect(persistEndorsement).not.toHaveBeenCalled();
  });

  it("未ログインでは確認回答を記録せずログインへ遷移する", async () => {
    await expect(submitVerification("request-1", "quiet")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/login?next=%2Fverify%2Frequest-1");
    expect(answerVerification).not.toHaveBeenCalled();
  });
});
