import type { AnalysisResult } from "@mosaiq/shared";

export type AnalyzerCapabilities = {
  vision: boolean;
  structuredOutput: boolean;
  model: string | null;
};

export type ProviderHealth = {
  id: string;
  configured: boolean;
  available: boolean;
  model: string | null;
  message: string | null;
};

export type AnalyzeImageInput = {
  image: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  filename: string;
};

export interface ImageAnalyzer {
  readonly id: string;
  getCapabilities(): AnalyzerCapabilities;
  healthCheck(): Promise<ProviderHealth>;
  analyze(input: AnalyzeImageInput): Promise<AnalysisResult>;
}

export class AnalyzerError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly rawResponse?: string,
    readonly parseError?: string,
  ) {
    super(message);
    this.name = "AnalyzerError";
  }
}
