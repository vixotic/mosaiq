import { z } from "zod";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

let configBaseDirectory = process.cwd();
for (const candidate of [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")]) {
  if (existsSync(candidate)) {
    process.loadEnvFile(candidate);
    configBaseDirectory = dirname(candidate);
    break;
  }
}

const configSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default("127.0.0.1"),
  API_PORT: z.coerce.number().int().positive().default(3001),
  WEB_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
  STORAGE_ROOT: z.string().default("./storage"),
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
  MAX_IMAGE_PIXELS: z.coerce.number().int().positive().default(80_000_000),
  AI_PROVIDER: z.enum(["disabled", "mock", "ollama", "gemini"]).default("gemini"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com"),
  GEMINI_MODEL: z.string().min(1).default("gemini-flash-latest"),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  OLLAMA_BASE_URL: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default(""),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(120_000),
  PROCESSING_WORKER_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

export type AppConfig = z.infer<typeof configSchema>;

export const loadConfig = (): AppConfig => {
  const config = configSchema.parse(process.env);
  return {
    ...config,
    STORAGE_ROOT: isAbsolute(config.STORAGE_ROOT)
      ? config.STORAGE_ROOT
      : resolve(configBaseDirectory, config.STORAGE_ROOT),
  };
};
