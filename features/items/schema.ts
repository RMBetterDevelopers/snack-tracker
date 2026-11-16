import { z } from "zod";

// Item ids come from Prisma's @default(cuid()), so anything else cannot be an item.
export const markAsBoughtSchema = z.object({
  itemId: z.cuid(),
});

export type MarkAsBoughtInput = z.infer<typeof markAsBoughtSchema>;

// The [id] segment of /items/[id]. Validated before it reaches Prisma.
export const itemDetailParamsSchema = z.object({ id: z.cuid() });

export type ItemDetailParams = z.infer<typeof itemDetailParamsSchema>;
