import { z } from "zod";

// Item ids come from Prisma's @default(cuid()), so anything else cannot be an item.
export const markAsBoughtSchema = z.object({
  itemId: z.cuid(),
});

export type MarkAsBoughtInput = z.infer<typeof markAsBoughtSchema>;
