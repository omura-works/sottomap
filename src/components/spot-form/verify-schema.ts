import { z } from "zod";

/** S6「確認」の3択（SPEC §2.3 / §4 S6）。 */
export const VERIFY_ANSWER_OPTIONS = [
  { value: "quiet", label: "静かなまま" },
  { value: "crowding", label: "並びはじめた" },
  { value: "touristy", label: "もう観光地になった" },
] as const;

export const verifyAnswerSchema = z.object({
  requestId: z.string().min(1),
  answer: z.enum(["quiet", "crowding", "touristy"], { error: "答えを選んでください" }),
});

export type VerifyAnswerInput = z.infer<typeof verifyAnswerSchema>;
