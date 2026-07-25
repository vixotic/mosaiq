import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import { assets, collectionItems, collections, libraryItems } from "@mosaiq/database";
import { and, count, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../database.provider.js";
import { LibraryItemsService } from "../library-items/library-items.service.js";

@Injectable()
export class CollectionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LibraryItemsService) private readonly items: LibraryItemsService,
  ) {}

  async list() {
    const rows = await this.db
      .select({
        collection: collections,
        imageCount: sql<number>`count(${collectionItems.libraryItemId})::int`,
      })
      .from(collections)
      .leftJoin(
        collectionItems,
        sql`${collectionItems.collectionId} = ${collections.id}
          and exists (
            select 1 from library_items li
            where li.id = ${collectionItems.libraryItemId} and li.deleted_at is null
          )`,
      )
      .groupBy(collections.id)
      .orderBy(desc(collections.updatedAt));
    return Promise.all(
      rows.map(async ({ collection, imageCount }) => {
        const [cover] = await this.db
          .select({ assetId: assets.id })
          .from(collectionItems)
          .innerJoin(libraryItems, eq(collectionItems.libraryItemId, libraryItems.id))
          .innerJoin(assets, eq(libraryItems.assetId, assets.id))
          .where(
            and(eq(collectionItems.collectionId, collection.id), isNull(libraryItems.deletedAt)),
          )
          .orderBy(desc(collectionItems.createdAt))
          .limit(1);
        return {
          id: collection.id,
          name: collection.name,
          description: collection.description,
          imageCount,
          coverThumbnailUrl: cover ? `/api/assets/${cover.assetId}/thumbnail` : null,
          createdAt: collection.createdAt.toISOString(),
          updatedAt: collection.updatedAt.toISOString(),
        };
      }),
    );
  }

  async create(input: { name: string; description?: string | null }) {
    const [created] = await this.db
      .insert(collections)
      .values({ name: input.name.trim(), description: input.description ?? null })
      .returning();
    if (!created) throw new Error("Collection was not created.");
    return created;
  }

  async update(id: string, patch: { name?: string; description?: string | null }) {
    const [updated] = await this.db
      .update(collections)
      .set({
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
        updatedAt: new Date(),
      })
      .where(eq(collections.id, id))
      .returning();
    if (!updated) throw new NotFoundException("Collection not found.");
    return updated;
  }

  async remove(id: string): Promise<void> {
    const [deleted] = await this.db
      .delete(collections)
      .where(eq(collections.id, id))
      .returning({ id: collections.id });
    if (!deleted) throw new NotFoundException("Collection not found.");
  }

  async addItems(id: string, itemIds: string[]) {
    const [collection] = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);
    if (!collection) throw new NotFoundException("Collection not found.");
    const visible = await this.db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(and(inArray(libraryItems.id, itemIds), isNull(libraryItems.deletedAt)));
    if (visible.length) {
      await this.db
        .insert(collectionItems)
        .values(visible.map(({ id: libraryItemId }) => ({ collectionId: id, libraryItemId })))
        .onConflictDoNothing();
    }
    return { added: visible.length };
  }

  async removeItem(id: string, itemId: string): Promise<void> {
    await this.db
      .delete(collectionItems)
      .where(and(eq(collectionItems.collectionId, id), eq(collectionItems.libraryItemId, itemId)));
  }

  async itemsPage(id: string, page = 1, pageSize = 30) {
    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const [exists] = await this.db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.id, id))
      .limit(1);
    if (!exists) throw new NotFoundException("Collection not found.");
    const [{ value: total = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(collectionItems)
      .innerJoin(libraryItems, eq(collectionItems.libraryItemId, libraryItems.id))
      .where(and(eq(collectionItems.collectionId, id), isNull(libraryItems.deletedAt)));
    const rows = await this.db
      .select({ id: libraryItems.id })
      .from(collectionItems)
      .innerJoin(libraryItems, eq(collectionItems.libraryItemId, libraryItems.id))
      .where(and(eq(collectionItems.collectionId, id), isNull(libraryItems.deletedAt)))
      .orderBy(desc(collectionItems.createdAt))
      .limit(safeSize)
      .offset((safePage - 1) * safeSize);
    return {
      items: await Promise.all(rows.map(({ id: itemId }) => this.items.summary(itemId))),
      page: safePage,
      pageSize: safeSize,
      total,
      hasNextPage: safePage * safeSize < total,
    };
  }
}
