import { describe, expect, it } from "vitest";
import { markAsBoughtSchema } from "./schema";

describe("markAsBoughtSchema", () => {
  it("accepts a cuid", () => {
    const result = markAsBoughtSchema.safeParse({ itemId: "cmhz8x0q50000a8u7k3j2f9vd" });

    expect(result.success).toBe(true);
  });

  it("rejects a missing itemId", () => {
    expect(markAsBoughtSchema.safeParse({}).success).toBe(false);
  });

  it.each(["", "123", "not a cuid!"])("rejects %j", (itemId) => {
    expect(markAsBoughtSchema.safeParse({ itemId }).success).toBe(false);
  });
});
