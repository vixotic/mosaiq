import { describe, expect, it } from "vitest";
import { analysisResultSchema, isUsableAnalysisResult } from "./contracts.js";

describe("analysisResultSchema", () => {
  it("keeps useful partial data and defaults missing arrays", () => {
    const result = analysisResultSchema.parse({
      title: "Quiet editorial layout",
      tags: [" calm "],
    });
    expect(result.title).toBe("Quiet editorial layout");
    expect(result.tags).toEqual(["calm"]);
    expect(result.styles).toEqual([]);
    expect(isUsableAnalysisResult(result)).toBe(true);
  });

  it("drops invalid array members", () => {
    const result = analysisResultSchema.parse({ tags: ["earthy", 42, null] });
    expect(result.tags).toEqual(["earthy"]);
  });
});
