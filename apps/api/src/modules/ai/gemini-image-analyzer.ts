import { Injectable } from "@nestjs/common";
import type { AnalysisResult } from "@mosaiq/shared";
import { loadConfig } from "../../config.js";
import { parseAnalysisResponse } from "./analysis-parser.js";
import { AnalyzerError } from "./analyzer.types.js";
import type {
  AnalyzeImageInput,
  AnalyzerCapabilities,
  ImageAnalyzer,
  ProviderHealth,
} from "./analyzer.types.js";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
};

const PROMPT = `Analyze this image as a visual inspiration reference.
Describe only details that are visibly supported. Do not invent URLs, brands, products, or intent.
Focus on reusable visual decisions: hierarchy, typography, spacing, composition, colour, imagery,
interface patterns, materials, lighting, and mood. Inspiration reasons must explain specifically
why a designer might save this reference.`;

const stringArray = {
  type: "array",
  items: { type: "string" },
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "A concise, descriptive title for the visible design." },
    description: {
      type: "string",
      description: "A factual two or three sentence description of the visible image.",
    },
    domains: stringArray,
    styles: stringArray,
    colours: stringArray,
    moods: stringArray,
    subjects: stringArray,
    typography: stringArray,
    composition: stringArray,
    useCases: stringArray,
    inspirationReasons: {
      ...stringArray,
      minItems: 2,
      maxItems: 4,
      description: "Specific visible design choices that make this reference worth saving.",
    },
    tags: {
      ...stringArray,
      description: "Concise phrases useful for finding this image later.",
    },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: [
    "title",
    "description",
    "domains",
    "styles",
    "colours",
    "moods",
    "subjects",
    "typography",
    "composition",
    "useCases",
    "inspirationReasons",
    "tags",
    "confidence",
  ],
};

@Injectable()
export class GeminiImageAnalyzer implements ImageAnalyzer {
  readonly id = "gemini";
  private readonly config = loadConfig();

  getCapabilities(): AnalyzerCapabilities {
    return {
      vision: true,
      structuredOutput: true,
      model: this.config.GEMINI_MODEL || null,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    if (!this.config.GEMINI_API_KEY) {
      return {
        id: this.id,
        configured: false,
        available: false,
        model: this.config.GEMINI_MODEL,
        message: "GEMINI_API_KEY is not configured.",
      };
    }

    try {
      const response = await this.request(
        `/v1beta/models/${encodeURIComponent(this.config.GEMINI_MODEL)}`,
        { method: "GET" },
        5_000,
      );
      return {
        id: this.id,
        configured: true,
        available: response.ok,
        model: this.config.GEMINI_MODEL,
        message: response.ok ? null : `Gemini health check returned HTTP ${response.status}.`,
      };
    } catch (error) {
      return {
        id: this.id,
        configured: true,
        available: false,
        model: this.config.GEMINI_MODEL,
        message: error instanceof Error ? error.message : "Gemini is unavailable.",
      };
    }
  }

  async analyze(input: AnalyzeImageInput): Promise<AnalysisResult> {
    if (!this.config.GEMINI_API_KEY) {
      throw new AnalyzerError("GEMINI_API_KEY is not configured.", false);
    }

    let response: Response;
    try {
      response = await this.request(
        `/v1beta/models/${encodeURIComponent(this.config.GEMINI_MODEL)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                role: "user",
                parts: [
                  { text: PROMPT },
                  {
                    inlineData: {
                      mimeType: input.mimeType,
                      data: input.image.toString("base64"),
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: RESPONSE_SCHEMA,
              temperature: 0.2,
              maxOutputTokens: 2_048,
            },
          }),
        },
        this.config.GEMINI_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof AnalyzerError) throw error;
      throw new AnalyzerError(
        error instanceof Error ? error.message : "Gemini request failed.",
        true,
      );
    }

    const rawHttpBody = await response.text();
    if (!response.ok) {
      throw new AnalyzerError(
        `Gemini returned HTTP ${response.status}.`,
        response.status === 408 || response.status === 429 || response.status >= 500,
        rawHttpBody,
      );
    }

    let envelope: GeminiResponse;
    try {
      envelope = JSON.parse(rawHttpBody) as GeminiResponse;
    } catch (error) {
      throw new AnalyzerError(
        "Gemini returned an invalid response envelope.",
        false,
        rawHttpBody,
        error instanceof Error ? error.message : "Invalid JSON",
      );
    }

    const generatedText = envelope.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();
    if (!generatedText) {
      const reason =
        envelope.promptFeedback?.blockReason ??
        envelope.candidates?.[0]?.finishReason ??
        "no generated content";
      throw new AnalyzerError(
        `Gemini analysis produced no content (${reason}).`,
        false,
        rawHttpBody,
      );
    }
    return parseAnalysisResponse(generatedText);
  }

  private async request(pathname: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = new Headers(init.headers);
      headers.set("x-goog-api-key", this.config.GEMINI_API_KEY);
      return await fetch(new URL(pathname, this.config.GEMINI_BASE_URL), {
        ...init,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new AnalyzerError(`Gemini timed out after ${timeoutMs}ms.`, true);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
