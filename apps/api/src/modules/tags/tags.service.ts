import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import { libraryItems, libraryItemTags, tags } from "@mosaiq/database";
import { and, eq, isNull } from "drizzle-orm";
import { DATABASE } from "../../database.provider.js";

export const normalizeTag = (label: string): string =>
  label.trim().replace(/\s+/g, " ").toLowerCase();

@Injectable()
export class TagsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async add(itemId: string, label: string) {
    const normalizedLabel = normalizeTag(label);
    if (!normalizedLabel || normalizedLabel.length > 200) {
      throw new Error("Tag must contain between 1 and 200 characters.");
    }
    const [item] = await this.db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(and(eq(libraryItems.id, itemId), isNull(libraryItems.deletedAt)))
      .limit(1);
    if (!item) throw new NotFoundException("Library item not found.");
    await this.db
      .insert(tags)
      .values({ normalizedLabel, displayLabel: label.trim().replace(/\s+/g, " ") })
      .onConflictDoNothing();
    const [tag] = await this.db
      .select()
      .from(tags)
      .where(eq(tags.normalizedLabel, normalizedLabel))
      .limit(1);
    if (!tag) throw new Error("Tag could not be created.");
    await this.db
      .insert(libraryItemTags)
      .values({ libraryItemId: itemId, tagId: tag.id, origin: "user" })
      .onConflictDoNothing();
    return { ...tag, origin: "user" as const, dismissed: false };
  }

  async remove(itemId: string, tagId: string): Promise<void> {
    await this.db
      .delete(libraryItemTags)
      .where(
        and(
          eq(libraryItemTags.libraryItemId, itemId),
          eq(libraryItemTags.tagId, tagId),
          eq(libraryItemTags.origin, "user"),
        ),
      );
  }

  async dismiss(itemId: string, tagId: string, dismissed: boolean) {
    const rows = await this.db
      .update(libraryItemTags)
      .set({ dismissedAt: dismissed ? new Date() : null })
      .where(
        and(
          eq(libraryItemTags.libraryItemId, itemId),
          eq(libraryItemTags.tagId, tagId),
          eq(libraryItemTags.origin, "ai"),
        ),
      )
      .returning();
    if (!rows.length) throw new NotFoundException("AI tag not found.");
    return { dismissed };
  }
}
