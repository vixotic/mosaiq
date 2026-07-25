import { Injectable } from "@nestjs/common";
import type { AnalysisResult } from "@mosaiq/shared";
import type {
  AnalyzeImageInput,
  AnalyzerCapabilities,
  ImageAnalyzer,
  ProviderHealth,
} from "./analyzer.types.js";

@Injectable()
export class MockImageAnalyzer implements ImageAnalyzer {
  readonly id = "mock";

  getCapabilities(): AnalyzerCapabilities {
    return { vision: true, structuredOutput: true, model: "deterministic-mock-v1" };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      id: this.id,
      configured: true,
      available: true,
      model: "deterministic-mock-v1",
      message: null,
    };
  }

  async analyze(input: AnalyzeImageInput): Promise<AnalysisResult> {
    const stem =
      input.filename
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "Untitled visual";
    const title = stem.replace(/\b\w/g, (character) => character.toUpperCase());

    return {
      title,
      description: `A visual reference imported from ${input.filename}.`,
      domains: ["visual inspiration"],
      styles: [],
      colours: [],
      moods: [],
      subjects: [],
      typography: [],
      composition: [],
      useCases: ["reference"],
      inspirationReasons: ["Saved as a visual reference for later review"],
      tags: ["visual reference", input.mimeType.split("/")[1] ?? "image"],
      confidence: 0.5,
      extra: { provider: this.id },
    };
  }
}
