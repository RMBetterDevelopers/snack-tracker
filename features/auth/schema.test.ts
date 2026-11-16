import { describe, expect, it } from "vitest";
import { z } from "zod";
import { signInSchema } from "./schema";

function fieldErrors(input: unknown) {
  const result = signInSchema.safeParse(input);
  if (result.success) {
    throw new Error("Expected the input to be invalid");
  }
  return z.flattenError(result.error).fieldErrors;
}

describe("signInSchema", () => {
  it("requires an email", () => {
    expect(fieldErrors({ email: "", password: "secret" }).email).toEqual(["Email is required"]);
  });

  it("treats a whitespace-only email as missing", () => {
    expect(fieldErrors({ email: "   ", password: "secret" }).email).toEqual(["Email is required"]);
  });

  it("requires a password", () => {
    expect(fieldErrors({ email: "a@example.com", password: "" }).password).toEqual(["Password is required"]);
  });

  it("reports both missing fields at once", () => {
    const errors = fieldErrors({ email: "", password: "" });
    expect(errors.email).toEqual(["Email is required"]);
    expect(errors.password).toEqual(["Password is required"]);
  });

  it("rejects a malformed email", () => {
    expect(fieldErrors({ email: "not-an-email", password: "secret" }).email).toEqual(["Enter a valid email"]);
  });

  it("trims the email of a valid input", () => {
    const result = signInSchema.parse({ email: "  a@example.com  ", password: "secret" });
    expect(result).toEqual({ email: "a@example.com", password: "secret" });
  });

  it("does not trim the password", () => {
    const result = signInSchema.parse({ email: "a@example.com", password: " secret " });
    expect(result.password).toBe(" secret ");
  });
});
