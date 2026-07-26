import { z } from "zod";

export const idSchema = z.string().uuid();
export const isoDateSchema = z.string().datetime();

export const processingStatusSchema = z.enum([
  "disabled",
  "pending",
  "processing",
  "completed",
  "failed",
  "cancelled",
]);
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

const stringArray = z.preprocess(
  (value) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim())
      : [],
  z.array(z.string()).transform((items) => items.filter(Boolean)),
);

export const analysisResultSchema = z
  .object({
    title: z.string().catch(""),
    description: z.string().catch(""),
    domains: stringArray.catch([]),
    styles: stringArray.catch([]),
    colours: stringArray.catch([]),
    moods: stringArray.catch([]),
    subjects: stringArray.catch([]),
    typography: stringArray.catch([]),
    composition: stringArray.catch([]),
    useCases: stringArray.catch([]),
    inspirationReasons: stringArray.catch([]),
    tags: stringArray.catch([]),
    confidence: z.number().min(0).max(1).optional().catch(undefined),
    extra: z.record(z.unknown()).optional().catch({}),
  })
  .passthrough()
  .transform((result) => ({
    title: result.title,
    description: result.description,
    domains: result.domains,
    styles: result.styles,
    colours: result.colours,
    moods: result.moods,
    subjects: result.subjects,
    typography: result.typography,
    composition: result.composition,
    useCases: result.useCases,
    inspirationReasons: result.inspirationReasons,
    tags: result.tags,
    ...(result.confidence === undefined ? {} : { confidence: result.confidence }),
    extra: result.extra ?? {},
  }));
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

export const isUsableAnalysisResult = (result: AnalysisResult): boolean =>
  Boolean(
    result.title.trim() ||
    result.description.trim() ||
    result.tags.length ||
    result.inspirationReasons.length,
  );

export const tagSchema = z.object({
  id: idSchema,
  displayLabel: z.string(),
  normalizedLabel: z.string(),
  origin: z.enum(["user", "ai"]),
  dismissed: z.boolean().default(false),
});
export type Tag = z.infer<typeof tagSchema>;

export const assetPublicSchema = z.object({
  id: idSchema,
  originalUrl: z.string(),
  thumbnailUrl: z.string(),
  mimeType: z.string(),
  fileSize: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type AssetPublic = z.infer<typeof assetPublicSchema>;

export const libraryItemSummarySchema = z.object({
  id: idSchema,
  assetId: idSchema,
  thumbnailUrl: z.string(),
  originalFilename: z.string(),
  resolvedTitle: z.string().nullable(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  favourite: z.boolean(),
  reviewed: z.boolean(),
  processingStatus: processingStatusSchema,
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type LibraryItemSummary = z.infer<typeof libraryItemSummarySchema>;

export const smartCategorySchema = z.object({
  label: z.string(),
  kind: z.enum(["domain", "style", "mood", "useCase"]),
  imageCount: z.number().int().positive(),
  coverThumbnailUrls: z.array(z.string()).max(3),
});
export type SmartCategory = z.infer<typeof smartCategorySchema>;

export const smartCategoriesResponseSchema = z.object({
  categories: z.array(smartCategorySchema),
  analyzedItemCount: z.number().int().nonnegative(),
  uncategorizedItemCount: z.number().int().nonnegative(),
});
export type SmartCategoriesResponse = z.infer<typeof smartCategoriesResponseSchema>;

export const activeAnalysisSchema = z.object({
  id: idSchema,
  providerId: z.string(),
  model: z.string().nullable(),
  status: z.string(),
  result: analysisResultSchema,
  tags: z.array(tagSchema),
  completedAt: isoDateSchema.nullable(),
});

export const libraryItemDetailSchema = z.object({
  id: idSchema,
  asset: assetPublicSchema,
  originalFilename: z.string(),
  sourceUrl: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  user: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
    notes: z.string().nullable(),
    inspirationReasonsOverride: z.array(z.string()).nullable(),
    favourite: z.boolean(),
    reviewed: z.boolean(),
    tags: z.array(tagSchema),
  }),
  activeAnalysis: activeAnalysisSchema.nullable(),
  resolved: z.object({
    title: z.string().nullable(),
    description: z.string().nullable(),
    inspirationReasons: z.array(z.string()),
  }),
  processing: z.object({
    status: processingStatusSchema,
    lastError: z.string().nullable(),
    canRetry: z.boolean(),
    canReanalyse: z.boolean(),
  }),
  collections: z.array(z.object({ id: idSchema, name: z.string() })).default([]),
});
export type LibraryItemDetail = z.infer<typeof libraryItemDetailSchema>;

export const updateLibraryItemSchema = z
  .object({
    userTitle: z.string().max(500).nullable().optional(),
    userDescription: z.string().max(10_000).nullable().optional(),
    userNotes: z.string().max(50_000).nullable().optional(),
    userInspirationReasons: z.array(z.string().trim().min(1).max(500)).nullable().optional(),
    sourceUrl: z
      .string()
      .url()
      .refine((url) => /^https?:\/\//i.test(url))
      .nullable()
      .optional(),
    favourite: z.boolean().optional(),
    reviewed: z.boolean().optional(),
  })
  .strict();
export type UpdateLibraryItemInput = z.infer<typeof updateLibraryItemSchema>;

export const pageResponseSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
  });

export const uploadResultSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    filename: z.string(),
    libraryItem: libraryItemSummarySchema,
  }),
  z.object({
    status: z.literal("duplicate"),
    filename: z.string(),
    existingItem: libraryItemSummarySchema,
  }),
  z.object({
    status: z.literal("restored"),
    filename: z.string(),
    libraryItem: libraryItemSummarySchema,
  }),
  z.object({
    status: z.literal("rejected"),
    filename: z.string(),
    code: z.string(),
    message: z.string(),
  }),
]);
export const batchUploadResponseSchema = z.object({ results: z.array(uploadResultSchema) });
export type BatchUploadResponse = z.infer<typeof batchUploadResponseSchema>;

export const collectionSummarySchema = z.object({
  id: idSchema,
  name: z.string(),
  description: z.string().nullable(),
  imageCount: z.number().int().nonnegative(),
  coverThumbnailUrl: z.string().nullable(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type CollectionSummary = z.infer<typeof collectionSummarySchema>;

export const settingsStatusSchema = z.object({
  database: z.object({ available: z.boolean(), message: z.string().nullable() }),
  storage: z.object({ available: z.boolean(), displayPath: z.string() }),
  provider: z.object({
    id: z.enum(["disabled", "mock", "ollama", "gemini"]),
    configured: z.boolean(),
    available: z.boolean(),
    model: z.string().nullable(),
    baseUrl: z.string().nullable(),
    message: z.string().nullable(),
  }),
  maxUploadBytes: z.number().int().positive(),
  lanExposed: z.boolean(),
});
export type SettingsStatus = z.infer<typeof settingsStatusSchema>;

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
