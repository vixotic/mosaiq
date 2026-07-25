import { describe, expect, it } from "vitest";
import { normalizeTag } from "./tags.service.js";

describe("normalizeTag", () => {
  it("trims, collapses whitespace, and lowercases only", () => {
    expect(normalizeTag("  Dark   UI  ")).toBe("dark ui");
    expect(normalizeTag("dark interface")).not.toBe(normalizeTag("dark UI"));
  });
});
