import { z } from "zod";

export const answerSpecSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("number"),
    value: z.number(),
    tolerance: z.number().nonnegative(),
    unit: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("choice"),
    value: z.enum(["A", "B", "C", "D"]),
  }),
]);

export type AnswerSpec = z.infer<typeof answerSpecSchema>;
