import { describe, expect, it } from "vitest";
import { MockImageAnalyzer } from "./mock-image-analyzer.js";

describe("MockImageAnalyzer", () => {
  it("returns deterministic, usable metadata without an AI service", async () => {
    const provider = new MockImageAnalyzer();
    const first = await provider.analyze({
      image: Buffer.from("fixture"),
      mimeType: "image/png",
      filename: "dark-dashboard.png",
    });
    const second = await provider.analyze({
      image: Buffer.from("different bytes"),
      mimeType: "image/png",
      filename: "dark-dashboard.png",
    });

    expect(first).toEqual(second);
    expect(first.title).toBe("Dark Dashboard");
    expect(first.tags).toContain("png");
    expect(first.inspirationReasons.length).toBeGreaterThan(0);
  });
});
