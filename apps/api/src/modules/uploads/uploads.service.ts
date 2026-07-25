import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import { assets, libraryItems, processingJobs } from "@mosaiq/database";
import type { BatchUploadResponse } from "@mosaiq/shared";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { DATABASE } from "../../database.provider.js";
import { LibraryItemsService } from "../library-items/library-items.service.js";
import { InvalidImageError, StorageService } from "../storage/storage.service.js";

const safeDisplayName = (value: string): string => {
  const utf8Candidate = Buffer.from(value, "latin1").toString("utf8");
  const decodedValue = utf8Candidate.includes("\uFFFD") ? value : utf8Candidate;
  const base = decodedValue
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim();
  return (base || "untitled-image").slice(0, 500);
};

@Injectable()
export class UploadsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(StorageService) private readonly storage: StorageService,
    @Inject(LibraryItemsService) private readonly itemService: LibraryItemsService,
  ) {}

  async upload(files: Express.Multer.File[]): Promise<BatchUploadResponse> {
    const results: BatchUploadResponse["results"] = [];
    for (const file of files) {
      const filename = safeDisplayName(file.originalname);
      try {
        const info = await this.storage.inspect(file.buffer);
        const [existingAsset] = await this.db
          .select()
          .from(assets)
          .where(eq(assets.contentHash, info.hash))
          .limit(1);
        if (existingAsset) {
          const [visible] = await this.db
            .select({ id: libraryItems.id })
            .from(libraryItems)
            .where(and(eq(libraryItems.assetId, existingAsset.id), isNull(libraryItems.deletedAt)))
            .orderBy(asc(libraryItems.createdAt))
            .limit(1);
          if (visible) {
            results.push({
              status: "duplicate",
              filename,
              existingItem: await this.itemService.summary(visible.id),
            });
            continue;
          }
          const [deleted] = await this.db
            .select({ id: libraryItems.id })
            .from(libraryItems)
            .where(
              and(eq(libraryItems.assetId, existingAsset.id), isNotNull(libraryItems.deletedAt)),
            )
            .orderBy(asc(libraryItems.createdAt))
            .limit(1);
          if (deleted) {
            await this.db
              .update(libraryItems)
              .set({ deletedAt: null, updatedAt: new Date() })
              .where(eq(libraryItems.id, deleted.id));
            await this.enqueue(deleted.id);
            results.push({
              status: "restored",
              filename,
              libraryItem: await this.itemService.summary(deleted.id),
            });
            continue;
          }
          const [created] = await this.db
            .insert(libraryItems)
            .values({ assetId: existingAsset.id, originalFilename: filename })
            .returning({ id: libraryItems.id });
          if (!created) throw new Error("Library item was not created.");
          await this.enqueue(created.id);
          results.push({
            status: "created",
            filename,
            libraryItem: await this.itemService.summary(created.id),
          });
          continue;
        }

        const stored = await this.storage.save(file.buffer, info);
        try {
          const created = await this.db.transaction(async (tx) => {
            const [asset] = await tx
              .insert(assets)
              .values({
                contentHash: info.hash,
                storageKey: stored.storageKey,
                thumbnailKey: stored.thumbnailKey,
                mimeType: info.mimeType,
                fileSize: info.fileSize,
                width: info.width,
                height: info.height,
              })
              .returning({ id: assets.id });
            if (!asset) throw new Error("Asset was not created.");
            const [item] = await tx
              .insert(libraryItems)
              .values({ assetId: asset.id, originalFilename: filename })
              .returning({ id: libraryItems.id });
            if (!item) throw new Error("Library item was not created.");
            return item;
          });
          await this.enqueue(created.id);
          results.push({
            status: "created",
            filename,
            libraryItem: await this.itemService.summary(created.id),
          });
        } catch (error) {
          await this.storage.remove([stored.storageKey, stored.thumbnailKey]);
          const [winner] = await this.db
            .select({ itemId: libraryItems.id })
            .from(assets)
            .innerJoin(libraryItems, eq(libraryItems.assetId, assets.id))
            .where(and(eq(assets.contentHash, info.hash), isNull(libraryItems.deletedAt)))
            .limit(1);
          if (!winner) throw error;
          results.push({
            status: "duplicate",
            filename,
            existingItem: await this.itemService.summary(winner.itemId),
          });
        }
      } catch (error) {
        results.push({
          status: "rejected",
          filename,
          code: error instanceof InvalidImageError ? error.code : "UPLOAD_FAILED",
          message: error instanceof Error ? error.message : "The image could not be imported.",
        });
      }
    }
    return { results };
  }

  private async enqueue(libraryItemId: string): Promise<void> {
    const providerId = process.env.AI_PROVIDER ?? "mock";
    if (providerId === "disabled") return;
    try {
      await this.db
        .insert(processingJobs)
        .values({ libraryItemId, providerId, jobType: "analyze" })
        .onConflictDoNothing();
    } catch {
      // The library item is already durable and useful without AI. A user-triggered
      // reanalysis can enqueue it later, so queue availability must not fail import.
    }
  }
}
