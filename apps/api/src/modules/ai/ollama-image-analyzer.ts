import { Injectable } from "@nestjs/common";
import type { AnalysisResult } from "@mosaiq/shared";
import { loadConfig } from "../../config.js";
import { AnalyzerError } from "./analyzer.types.js";
import type {
  AnalyzeImageInput,
  AnalyzerCapabilities,
  ImageAnalyzer,
  ProviderHealth,
} from "./analyzer.types.js";
import { parseAnalysisResponse } from "./analysis-parser.js";

type OllamaTagsResponse = { models?: Array<{ name?: string; model?: string }> };
type OllamaGenerateResponse = { response?: string };

const PROMPT = `Analyze the attached visual inspiration image and return one JSON object only.
The object must have these keys and value types:
- title and description: strings
- domains, styles, colours, moods, subjects, typography, composition, useCases, tags: string arrays
- inspirationReasons: a string array with 2 to 4 specific observations about visible layout,
  colour, typography, composition, or reusable design patterns
- confidence: a number from 0 to 1
- extra: an object for useful domain-specific details
Be domain-agnostic and factual. Make every tag and inspiration reason specific to this image.
Never repeat these instructions. Use an empty array only when a field truly does not apply.
Do not use markdown or add text outside the JSON object.`;

@Injectable()
export class OllamaImageAnalyzer implements ImageAnalyzer {
  readonly id = "ollama";
  private readonly config = loadConfig();

  getCapabilities(): AnalyzerCapabilities {
    return {
      vision: true,
      structuredOutput: true,
      model: this.config.OLLAMA_MODEL || null,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.config.OLLAMA_MODEL) {
      return {
        id: this.id,
        configured: false,
        available: false,
        model: null,
        message: "OLLAMA_MODEL is not configured.",
      };
    }

    try {
      const response = await this.request("/api/tags", { method: "GET" }, 5_000);
      if (!response.ok) {
        return {
          id: this.id,
          configured: true,
          available: false,
          model: this.config.OLLAMA_MODEL,
          message: `Ollama health check returned HTTP ${response.status}.`,
        };
      }
      const body = (await response.json()) as OllamaTagsResponse;
      const configuredModel = this.config.OLLAMA_MODEL;
      const installed = (body.models ?? []).some((entry) => {
        const name = entry.name ?? entry.model ?? "";
        return name === configuredModel || name.split(":")[0] === configuredModel.split(":")[0];
      });
      return {
        id: this.id,
        configured: true,
        available: installed,
        model: configuredModel,
        message: installed ? null : `Model "${configuredModel}" is not installed in Ollama.`,
      };
    } catch (error) {
      return {
        id: this.id,
        configured: true,
        available: false,
        model: this.config.OLLAMA_MODEL,
        message: error instanceof Error ? error.message : "Ollama is unavailable.",
      };
    }
  }

  async analyze(input: AnalyzeImageInput): Promise<AnalysisResult> {
    if (!this.config.OLLAMA_MODEL) {
      throw new AnalyzerError("OLLAMA_MODEL is not configured.", false);
    }

    let response: Response;
    try {
      response = await this.request(
        "/api/generate",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: this.config.OLLAMA_MODEL,
            prompt: PROMPT,
            images: [input.image.toString("base64")],
            stream: false,
            format: "json",
            options: { temperature: 0.1 },
          }),
        },
        this.config.OLLAMA_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof AnalyzerError) throw error;
      throw new AnalyzerError(
        error instanceof Error ? error.message : "Ollama request failed.",
        true,
      );
    }

    const rawHttpBody = await response.text();
    if (!response.ok) {
      throw new AnalyzerError(
        `Ollama returned HTTP ${response.status}.`,
        response.status >= 500 || response.status === 429,
        rawHttpBody,
      );
    }

    let envelope: OllamaGenerateResponse;
    try {
      envelope = JSON.parse(rawHttpBody) as OllamaGenerateResponse;
    } catch (error) {
      throw new AnalyzerError(
        "Ollama returned an invalid response envelope.",
        false,
        rawHttpBody,
        error instanceof Error ? error.message : "Invalid JSON",
      );
    }
    if (typeof envelope.response !== "string") {
      throw new AnalyzerError(
        "Ollama response did not include generated content.",
        false,
        rawHttpBody,
      );
    }
    return parseAnalysisResponse(envelope.response);
  }

  private async request(pathname: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(new URL(pathname, this.config.OLLAMA_BASE_URL), {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AnalyzerError(`Ollama timed out after ${timeoutMs}ms.`, true);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
