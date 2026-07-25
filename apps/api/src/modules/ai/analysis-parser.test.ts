import { describe, expect, it } from "vitest";
import { AnalyzerError } from "./analyzer.types.js";
import {
  normalizeAnalysisResult,
  parseAnalysisResponse,
  truncateRawResponse,
} from "./analysis-parser.js";

describe("analysis response parsing", () => {
  it("accepts fenced JSON and supplies defaults for missing arrays", () => {
    const result = parseAnalysisResponse(`
      \`\`\`json
      {"title":"Quiet dashboard","tags":[" dark UI ",42],"inspirationReasons":["Clear hierarchy"]}
      \`\`\`
    `);

    expect(result.title).toBe("Quiet dashboard");
    expect(result.tags).toEqual(["dark UI"]);
    expect(result.styles).toEqual([]);
    expect(result.inspirationReasons).toEqual(["Clear hierarchy"]);
  });

  it("normalizes malformed optional fields without losing useful fields", () => {
    const result = normalizeAnalysisResult({
      title: 123,
      description: "Useful composition",
      tags: ["Poster", "poster", null],
      confidence: 4,
    });

    expect(result.title).toBe("");
    expect(result.description).toBe("Useful composition");
    expect(result.tags).toEqual(["Poster"]);
    expect(result.confidence).toBeUndefined();
  });

  it("drops punctuation-only and prompt-placeholder list values", () => {
    const result = normalizeAnalysisResult({
      title: "Calm editorial page",
      tags: [".*", "searchable phrases", "editorial layout"],
      inspirationReasons: ["why this is worth saving", ".", "Strong type hierarchy"],
    });

    expect(result.tags).toEqual(["editorial layout"]);
    expect(result.inspirationReasons).toEqual(["Strong type hierarchy"]);
  });

  it("rejects malformed and unusable top-level responses", () => {
    expect(() => parseAnalysisResponse("not json")).toThrow(AnalyzerError);
    expect(() => parseAnalysisResponse('{"title":"","tags":[]}')).toThrow(
      "did not contain useful metadata",
    );
  });

  it("bounds retained raw responses", () => {
    expect(truncateRawResponse("x".repeat(300_000))).toContain("[truncated]");
  });
});
