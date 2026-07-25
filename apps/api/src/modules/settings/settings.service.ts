import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import { sql } from "drizzle-orm";
import { loadConfig } from "../../config.js";
import { DATABASE } from "../../database.provider.js";
import { StorageService } from "../storage/storage.service.js";

@Injectable()
export class SettingsService {
  private readonly config = loadConfig();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async status() {
    let databaseAvailable = false;
    let databaseMessage: string | null = null;
    try {
      await this.db.execute(sql`select 1`);
      databaseAvailable = true;
    } catch {
      databaseMessage = "Database connection unavailable.";
    }

    const storageAvailable = await this.storage.health();
    const provider = await this.providerStatus();
    return {
      database: { available: databaseAvailable, message: databaseMessage },
      storage: {
        available: storageAvailable,
        displayPath: this.storage.displayPath,
      },
      provider,
      maxUploadBytes: this.config.MAX_UPLOAD_BYTES,
      lanExposed: !["127.0.0.1", "localhost", "::1"].includes(this.config.API_HOST),
    };
  }

  private async providerStatus() {
    if (this.config.AI_PROVIDER === "disabled") {
      return {
        id: "disabled" as const,
        configured: true,
        available: true,
        model: null,
        baseUrl: null,
        message: "AI analysis is disabled.",
      };
    }
    if (this.config.AI_PROVIDER === "mock") {
      return {
        id: "mock" as const,
        configured: true,
        available: true,
        model: "mock",
        baseUrl: null,
        message: null,
      };
    }
    if (this.config.AI_PROVIDER === "gemini") {
      if (!this.config.GEMINI_API_KEY) {
        return {
          id: "gemini" as const,
          configured: false,
          available: false,
          model: this.config.GEMINI_MODEL,
          baseUrl: this.config.GEMINI_BASE_URL,
          message: "GEMINI_API_KEY is not configured.",
        };
      }
      try {
        const response = await fetch(
          new URL(
            `/v1beta/models/${encodeURIComponent(this.config.GEMINI_MODEL)}`,
            this.config.GEMINI_BASE_URL,
          ),
          {
            headers: { "x-goog-api-key": this.config.GEMINI_API_KEY },
            signal: AbortSignal.timeout(Math.min(this.config.GEMINI_TIMEOUT_MS, 5_000)),
          },
        );
        return {
          id: "gemini" as const,
          configured: true,
          available: response.ok,
          model: this.config.GEMINI_MODEL,
          baseUrl: this.config.GEMINI_BASE_URL,
          message: response.ok ? null : `Gemini returned HTTP ${response.status}.`,
        };
      } catch {
        return {
          id: "gemini" as const,
          configured: true,
          available: false,
          model: this.config.GEMINI_MODEL,
          baseUrl: this.config.GEMINI_BASE_URL,
          message: "Gemini is unavailable.",
        };
      }
    }
    const configured = Boolean(this.config.OLLAMA_MODEL);
    if (!configured) {
      return {
        id: "ollama" as const,
        configured: false,
        available: false,
        model: null,
        baseUrl: this.config.OLLAMA_BASE_URL,
        message: "OLLAMA_MODEL is not configured.",
      };
    }
    try {
      const response = await fetch(new URL("/api/tags", this.config.OLLAMA_BASE_URL), {
        signal: AbortSignal.timeout(Math.min(this.config.OLLAMA_TIMEOUT_MS, 5_000)),
      });
      return {
        id: "ollama" as const,
        configured: true,
        available: response.ok,
        model: this.config.OLLAMA_MODEL,
        baseUrl: this.config.OLLAMA_BASE_URL,
        message: response.ok ? null : `Ollama returned HTTP ${response.status}.`,
      };
    } catch {
      return {
        id: "ollama" as const,
        configured: true,
        available: false,
        model: this.config.OLLAMA_MODEL,
        baseUrl: this.config.OLLAMA_BASE_URL,
        message: "Ollama is unavailable.",
      };
    }
  }
}
