import { describe, expect, it } from "vitest";
import { itemDetailParamsSchema, markAsBoughtSchema } from "./schema";

describe("itemDetailParamsSchema", () => {
  it("accepts a cuid and returns it unchanged", () => {
    const result = itemDetailParamsSchema.safeParse({ id: "cmhz8x0q50000a8u7k3j2f9vd" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "cmhz8x0q50000a8u7k3j2f9vd" });
  });

  it("rejects a missing id", () => {
    expect(itemDetailParamsSchema.safeParse({}).success).toBe(false);
  });

  it.each(["", "not a cuid!"])("rejects %j", (id) => {
    expect(itemDetailParamsSchema.safeParse({ id }).success).toBe(false);
  });
});

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
