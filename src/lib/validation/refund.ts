import { z } from "zod";

function optionalTrimmedString(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => value || undefined)
    .optional();
}

export const refundInputSchema = z.object({
  orderId: z.string().trim().cuid(),
  amount: z.number().int().positive(),
  externalReference: optionalTrimmedString(120),
  note: optionalTrimmedString(500),
});
