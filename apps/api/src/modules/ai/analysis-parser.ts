import { analysisResultSchema, isUsableAnalysisResult, type AnalysisResult } from "@mosaiq/shared";
import { AnalyzerError } from "./analyzer.types.js";

const MAX_RAW_RESPONSE_BYTES = 256 * 1024;

export const truncateRawResponse = (value: string): string =>
  Buffer.byteLength(value, "utf8") <= MAX_RAW_RESPONSE_BYTES
    ? value
    : `${Buffer.from(value, "utf8").subarray(0, MAX_RAW_RESPONSE_BYTES).toString("utf8")}\n[truncated]`;

export const extractJsonText = (raw: string): string => {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
};

const deduplicate = (values: string[]): string[] => {
  const seen = new Set<string>();
  const promptPlaceholders = new Set(["searchable phrases", "why this is worth saving"]);
  return values.filter((value) => {
    const key = value.toLocaleLowerCase();
    if (!/[\p{L}\p{N}]/u.test(value) || promptPlaceholders.has(key)) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export const normalizeAnalysisResult = (input: unknown): AnalysisResult => {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new AnalyzerError("The provider did not return a JSON object.", false);
  }

  const parsed = analysisResultSchema.parse(input);
  return {
    ...parsed,
    domains: deduplicate(parsed.domains),
    styles: deduplicate(parsed.styles),
    colours: deduplicate(parsed.colours),
    moods: deduplicate(parsed.moods),
    subjects: deduplicate(parsed.subjects),
    typography: deduplicate(parsed.typography),
    composition: deduplicate(parsed.composition),
    useCases: deduplicate(parsed.useCases),
    inspirationReasons: deduplicate(parsed.inspirationReasons),
    tags: deduplicate(parsed.tags),
  };
};

export const parseAnalysisResponse = (raw: string): AnalysisResult => {
  const boundedRaw = truncateRawResponse(raw);
  let decoded: unknown;
  try {
    decoded = JSON.parse(extractJsonText(raw));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new AnalyzerError("The provider returned malformed JSON.", false, boundedRaw, message);
  }

  const normalized = normalizeAnalysisResult(decoded);
  if (!isUsableAnalysisResult(normalized)) {
    throw new AnalyzerError(
      "The provider response did not contain useful metadata.",
      false,
      boundedRaw,
    );
  }
  return normalized;
};
