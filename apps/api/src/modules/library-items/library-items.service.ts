import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import {
  aiAnalysisRuns,
  assets,
  collectionItems,
  collections,
  libraryItems,
  libraryItemTags,
  processingJobs,
  tags,
} from "@mosaiq/database";
import type { LibraryItemDetail, LibraryItemSummary, UpdateLibraryItemInput } from "@mosaiq/shared";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../database.provider.js";

const iso = (value: Date): string => value.toISOString();

@Injectable()
export class LibraryItemsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async processingState(id: string) {
    const [job] = await this.db
      .select()
      .from(processingJobs)
      .where(eq(processingJobs.libraryItemId, id))
      .orderBy(desc(processingJobs.createdAt))
      .limit(1);
    return {
      status: (job?.status ?? (process.env.AI_PROVIDER === "disabled" ? "disabled" : "pending")) as
        "disabled" | "pending" | "processing" | "completed" | "failed" | "cancelled",
      lastError: job?.lastError ?? null,
      canRetry: job?.status === "failed",
      canReanalyse: Boolean(process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "disabled"),
    };
  }

  async summary(id: string): Promise<LibraryItemSummary> {
    const [row] = await this.db
      .select({ item: libraryItems, asset: assets, analysis: aiAnalysisRuns })
      .from(libraryItems)
      .innerJoin(assets, eq(libraryItems.assetId, assets.id))
      .leftJoin(aiAnalysisRuns, eq(libraryItems.activeAnalysisRunId, aiAnalysisRuns.id))
      .where(eq(libraryItems.id, id))
      .limit(1);
    if (!row) throw new NotFoundException("Library item not found.");
    const result = row.analysis?.validatedResult;
    const processing = await this.processingState(id);
    return {
      id: row.item.id,
      assetId: row.asset.id,
      thumbnailUrl: `/api/assets/${row.asset.id}/thumbnail`,
      originalFilename: row.item.originalFilename,
      resolvedTitle: row.item.userTitle ?? result?.title ?? null,
      width: row.asset.width,
      height: row.asset.height,
      favourite: row.item.favourite,
      reviewed: row.item.reviewed,
      processingStatus: processing.status,
      createdAt: iso(row.item.createdAt),
      updatedAt: iso(row.item.updatedAt),
    };
  }

  async list(query: {
    page?: number;
    pageSize?: number;
    favourite?: boolean;
    reviewed?: boolean;
    sort?: "asc" | "desc";
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 30));
    const filters = [
      isNull(libraryItems.deletedAt),
      ...(query.favourite === undefined ? [] : [eq(libraryItems.favourite, query.favourite)]),
      ...(query.reviewed === undefined ? [] : [eq(libraryItems.reviewed, query.reviewed)]),
    ];
    const [{ value: total = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(libraryItems)
      .where(and(...filters));
    const rows = await this.db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(and(...filters))
      .orderBy(query.sort === "asc" ? libraryItems.createdAt : desc(libraryItems.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const items = await Promise.all(rows.map((row) => this.summary(row.id)));
    return { items, page, pageSize, total, hasNextPage: page * pageSize < total };
  }

  async detail(id: string): Promise<LibraryItemDetail> {
    const [row] = await this.db
      .select({ item: libraryItems, asset: assets, analysis: aiAnalysisRuns })
      .from(libraryItems)
      .innerJoin(assets, eq(libraryItems.assetId, assets.id))
      .leftJoin(aiAnalysisRuns, eq(libraryItems.activeAnalysisRunId, aiAnalysisRuns.id))
      .where(and(eq(libraryItems.id, id), isNull(libraryItems.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException("Library item not found.");
    const tagRows = await this.db
      .select({
        id: tags.id,
        displayLabel: tags.displayLabel,
        normalizedLabel: tags.normalizedLabel,
      })
      .from(libraryItemTags)
      .innerJoin(tags, eq(libraryItemTags.tagId, tags.id))
      .where(and(eq(libraryItemTags.libraryItemId, id), eq(libraryItemTags.origin, "user")));
    const aiTagRows = row.analysis
      ? await this.db
          .select({
            id: tags.id,
            displayLabel: tags.displayLabel,
            normalizedLabel: tags.normalizedLabel,
            dismissedAt: libraryItemTags.dismissedAt,
          })
          .from(libraryItemTags)
          .innerJoin(tags, eq(libraryItemTags.tagId, tags.id))
          .where(
            and(
              eq(libraryItemTags.libraryItemId, id),
              eq(libraryItemTags.origin, "ai"),
              eq(libraryItemTags.analysisRunId, row.analysis.id),
            ),
          )
      : [];
    const collectionRows = await this.db
      .select({ id: collections.id, name: collections.name })
      .from(collectionItems)
      .innerJoin(collections, eq(collectionItems.collectionId, collections.id))
      .where(eq(collectionItems.libraryItemId, id));
    const result = row.analysis?.validatedResult;
    return {
      id,
      asset: {
        id: row.asset.id,
        originalUrl: `/api/assets/${row.asset.id}/original`,
        thumbnailUrl: `/api/assets/${row.asset.id}/thumbnail`,
        mimeType: row.asset.mimeType,
        fileSize: row.asset.fileSize,
        width: row.asset.width,
        height: row.asset.height,
      },
      originalFilename: row.item.originalFilename,
      sourceUrl: row.item.sourceUrl,
      createdAt: iso(row.item.createdAt),
      updatedAt: iso(row.item.updatedAt),
      user: {
        title: row.item.userTitle,
        description: row.item.userDescription,
        notes: row.item.userNotes,
        inspirationReasonsOverride: row.item.userInspirationReasons,
        favourite: row.item.favourite,
        reviewed: row.item.reviewed,
        tags: tagRows.map((tag) => ({ ...tag, origin: "user" as const, dismissed: false })),
      },
      activeAnalysis:
        row.analysis && result
          ? {
              id: row.analysis.id,
              providerId: row.analysis.providerId,
              model: row.analysis.model,
              status: row.analysis.status,
              result,
              tags: aiTagRows.map((tag) => ({
                id: tag.id,
                displayLabel: tag.displayLabel,
                normalizedLabel: tag.normalizedLabel,
                origin: "ai" as const,
                dismissed: tag.dismissedAt !== null,
              })),
              completedAt: row.analysis.completedAt ? iso(row.analysis.completedAt) : null,
            }
          : null,
      resolved: {
        title: row.item.userTitle ?? result?.title ?? null,
        description: row.item.userDescription ?? result?.description ?? null,
        inspirationReasons: row.item.userInspirationReasons ?? result?.inspirationReasons ?? [],
      },
      processing: await this.processingState(id),
      collections: collectionRows,
    };
  }

  async update(id: string, patch: UpdateLibraryItemInput): Promise<LibraryItemDetail> {
    const [updated] = await this.db
      .update(libraryItems)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(libraryItems.id, id), isNull(libraryItems.deletedAt)))
      .returning({ id: libraryItems.id });
    if (!updated) throw new NotFoundException("Library item not found.");
    return this.detail(id);
  }

  async softDelete(id: string): Promise<void> {
    const [deleted] = await this.db
      .update(libraryItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(libraryItems.id, id), isNull(libraryItems.deletedAt)))
      .returning({ id: libraryItems.id });
    if (!deleted) throw new NotFoundException("Library item not found.");
    await this.db
      .update(processingJobs)
      .set({ status: "cancelled", completedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(processingJobs.libraryItemId, id), eq(processingJobs.status, "pending")));
  }
}
