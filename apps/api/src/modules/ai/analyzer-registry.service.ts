import { Inject, Injectable } from "@nestjs/common";
import { loadConfig } from "../../config.js";
import { GeminiImageAnalyzer } from "./gemini-image-analyzer.js";
import { MockImageAnalyzer } from "./mock-image-analyzer.js";
import { OllamaImageAnalyzer } from "./ollama-image-analyzer.js";
import type { ImageAnalyzer, ProviderHealth } from "./analyzer.types.js";

@Injectable()
export class AnalyzerRegistry {
  private readonly config = loadConfig();
  private readonly providers: Map<string, ImageAnalyzer>;

  constructor(
    @Inject(MockImageAnalyzer) mock: MockImageAnalyzer,
    @Inject(OllamaImageAnalyzer) ollama: OllamaImageAnalyzer,
    @Inject(GeminiImageAnalyzer) gemini: GeminiImageAnalyzer,
  ) {
    this.providers = new Map<string, ImageAnalyzer>();
    this.providers.set(mock.id, mock);
    this.providers.set(ollama.id, ollama);
    this.providers.set(gemini.id, gemini);
  }

  get activeProviderId(): "disabled" | "mock" | "ollama" | "gemini" {
    return this.config.AI_PROVIDER;
  }

  getActive(): ImageAnalyzer | null {
    return this.activeProviderId === "disabled" ? null : this.get(this.activeProviderId);
  }

  get(id: string): ImageAnalyzer {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown AI provider "${id}".`);
    return provider;
  }

  async statuses(): Promise<{
    activeProviderId: string;
    providers: ProviderHealth[];
  }> {
    return {
      activeProviderId: this.activeProviderId,
      providers: await Promise.all([...this.providers.values()].map((item) => item.healthCheck())),
    };
  }
}
