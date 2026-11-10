import { describe, expect, it } from "vitest";
import { createFamilyBodySchema, signupBodySchema, updateMemberBodySchema } from "./index.js";

describe("input normalization", () => {
  it("trims and lowercases emails", () => {
    const parsed = signupBodySchema.parse({
      email: "  Mom@Example.COM ",
      password: "correct horse",
      displayName: " Mom ",
    });
    expect(parsed).toEqual({
      email: "mom@example.com",
      password: "correct horse",
      displayName: "Mom",
    });
  });

  it("rejects unknown fields on inputs", () => {
    expect(
      signupBodySchema.safeParse({
        email: "a@b.co",
        password: "12345678",
        displayName: "A",
        role: "PARENT",
      }).success,
    ).toBe(false);
  });
});

describe("validation", () => {
  it("requires a real IANA time zone", () => {
    expect(
      createFamilyBodySchema.safeParse({ name: "Smiths", timeZone: "America/Chicago" }).success,
    ).toBe(true);
    expect(createFamilyBodySchema.safeParse({ name: "Smiths", timeZone: "Central" }).success).toBe(
      false,
    );
  });

  it("accepts a null PIN (remove) but not a malformed one", () => {
    expect(updateMemberBodySchema.safeParse({ pin: null }).success).toBe(true);
    expect(updateMemberBodySchema.safeParse({ pin: "12a4" }).success).toBe(false);
    expect(updateMemberBodySchema.safeParse({ pin: "123" }).success).toBe(false);
  });

  it("bounds daily capacity to 0–1440 whole minutes", () => {
    const week = { sun: 0, mon: 30, tue: 30, wed: 30, thu: 30, fri: 30, sat: 1440 };
    expect(updateMemberBodySchema.safeParse({ capacity: week }).success).toBe(true);
    expect(updateMemberBodySchema.safeParse({ capacity: { ...week, mon: 1441 } }).success).toBe(
      false,
    );
    expect(updateMemberBodySchema.safeParse({ capacity: { ...week, mon: 2.5 } }).success).toBe(
      false,
    );
  });
});
