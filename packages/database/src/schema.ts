import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AnalysisResult } from "@mosaiq/shared";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentHash: text("content_hash").notNull(),
    storageKey: text("storage_key").notNull(),
    thumbnailKey: text("thumbnail_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("assets_content_hash_uidx").on(table.contentHash),
    uniqueIndex("assets_storage_key_uidx").on(table.storageKey),
  ],
);

export const libraryItems = pgTable(
  "library_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    originalFilename: text("original_filename").notNull(),
    sourceUrl: text("source_url"),
    userTitle: text("user_title"),
    userDescription: text("user_description"),
    userNotes: text("user_notes"),
    userInspirationReasons: jsonb("user_inspiration_reasons").$type<string[] | null>(),
    userMetadata: jsonb("user_metadata").$type<Record<string, unknown>>().default({}).notNull(),
    activeAnalysisRunId: uuid("active_analysis_run_id").references(
      (): AnyPgColumn => aiAnalysisRuns.id,
    ),
    reviewed: boolean("reviewed").default(false).notNull(),
    favourite: boolean("favourite").default(false).notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("library_items_asset_idx").on(table.assetId),
    index("library_items_created_idx").on(table.createdAt),
    index("library_items_reviewed_idx").on(table.reviewed),
    index("library_items_favourite_idx").on(table.favourite),
    index("library_items_visible_idx")
      .on(table.createdAt)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const aiAnalysisRuns = pgTable(
  "ai_analysis_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItems.id),
    providerId: text("provider_id").notNull(),
    model: text("model"),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    status: text("status").notNull(),
    rawResponse: text("raw_response"),
    validatedResult: jsonb("validated_result").$type<AnalysisResult>(),
    parseError: text("parse_error"),
    errorMessage: text("error_message"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    becameActive: boolean("became_active").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analysis_runs_item_created_idx").on(table.libraryItemId, table.createdAt),
    index("analysis_runs_provider_status_idx").on(table.providerId, table.status),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    normalizedLabel: text("normalized_label").notNull(),
    displayLabel: text("display_label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("tags_normalized_label_uidx").on(table.normalizedLabel)],
);

export const libraryItemTags = pgTable(
  "library_item_tags",
  {
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItems.id),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id),
    origin: text("origin").notNull(),
    analysisRunId: uuid("analysis_run_id").references(() => aiAnalysisRuns.id),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("library_item_tags_tag_idx").on(table.tagId),
    index("library_item_tags_item_origin_idx").on(
      table.libraryItemId,
      table.origin,
      table.dismissedAt,
    ),
    uniqueIndex("library_item_tags_user_uidx")
      .on(table.libraryItemId, table.tagId)
      .where(sql`${table.origin} = 'user'`),
    uniqueIndex("library_item_tags_ai_uidx")
      .on(table.libraryItemId, table.tagId, table.analysisRunId)
      .where(sql`${table.origin} = 'ai'`),
    check(
      "library_item_tags_origin_run_check",
      sql`(${table.origin} = 'user' and ${table.analysisRunId} is null) or (${table.origin} = 'ai' and ${table.analysisRunId} is not null)`,
    ),
  ],
);

export const processingJobs = pgTable(
  "processing_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItems.id),
    providerId: text("provider_id").notNull(),
    jobType: text("job_type").default("analyze").notNull(),
    status: text("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => [
    index("processing_jobs_claim_idx").on(table.status, table.availableAt, table.createdAt),
    index("processing_jobs_item_idx").on(table.libraryItemId, table.createdAt),
    uniqueIndex("processing_jobs_active_uidx")
      .on(table.libraryItemId, table.providerId, table.jobType)
      .where(sql`${table.status} in ('pending', 'processing')`),
  ],
);

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    ...timestamps,
  },
  (table) => [index("collections_name_idx").on(table.name)],
);

export const collectionItems = pgTable(
  "collection_items",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    libraryItemId: uuid("library_item_id")
      .notNull()
      .references(() => libraryItems.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.collectionId, table.libraryItemId] }),
    index("collection_items_library_item_idx").on(table.libraryItemId),
  ],
);
