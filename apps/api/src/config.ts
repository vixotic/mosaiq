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

const configSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    API_HOST: z.string().default("127.0.0.1"),
    API_PORT: z.coerce.number().int().positive().default(3001),
    WEB_ORIGIN: z.string().url().default("http://127.0.0.1:5173"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    AUTH_OWNER_USERNAME: z.string().trim().min(1).max(200),
    AUTH_OWNER_PASSWORD_HASH: z.string().startsWith("$argon2id$"),
    AUTH_SESSION_TTL_HOURS: z.coerce
      .number()
      .int()
      .positive()
      .max(24 * 90)
      .default(168),
    AUTH_LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().max(100).default(5),
    AUTH_LOGIN_WINDOW_MINUTES: z.coerce.number().int().positive().max(1440).default(15),
    API_TRUST_PROXY: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    STORAGE_ROOT: z.string().default("./storage"),
    STORAGE_DRIVER: z.enum(["filesystem", "oci"]).default("filesystem"),
    OCI_AUTH_MODE: z.enum(["instance_principal", "config_file"]).default("instance_principal"),
    OCI_OBJECT_STORAGE_NAMESPACE: z.string().default(""),
    OCI_OBJECT_STORAGE_BUCKET: z.string().default(""),
    OCI_OBJECT_STORAGE_REGION: z.string().default(""),
    OCI_OBJECT_STORAGE_PREFIX: z.string().default("mosaiq"),
    OCI_CONFIG_FILE: z.string().default(""),
    OCI_CONFIG_PROFILE: z.string().default("DEFAULT"),
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
  })
  .superRefine((config, context) => {
    if (config.STORAGE_DRIVER !== "oci") return;
    for (const field of [
      "OCI_OBJECT_STORAGE_NAMESPACE",
      "OCI_OBJECT_STORAGE_BUCKET",
      "OCI_OBJECT_STORAGE_REGION",
    ] as const) {
      if (!config[field].trim()) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when STORAGE_DRIVER=oci.`,
        });
      }
    }
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
