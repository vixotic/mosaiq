import { Inject, Injectable } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import { libraryItems } from "@mosaiq/database";
import { and, count, desc, isNull, sql } from "drizzle-orm";
import { DATABASE } from "../../database.provider.js";
import { LibraryItemsService } from "../library-items/library-items.service.js";

@Injectable()
export class SearchService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LibraryItemsService) private readonly items: LibraryItemsService,
  ) {}

  async search(input: {
    q: string;
    page?: number;
    pageSize?: number;
    favourite?: boolean;
    reviewed?: boolean;
    collectionId?: string;
  }) {
    const page = Math.max(1, input.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 30));
    const term = `%${input.q.trim().replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
    const match = sql<boolean>`(
      coalesce(${libraryItems.userTitle}, '') ilike ${term} escape '\\'
      or coalesce(${libraryItems.userDescription}, '') ilike ${term} escape '\\'
      or coalesce(${libraryItems.userNotes}, '') ilike ${term} escape '\\'
      or exists (
        select 1 from library_item_tags lit
        join tags t on t.id = lit.tag_id
        where lit.library_item_id = ${libraryItems.id}
          and lit.dismissed_at is null
          and (
            lit.origin = 'user'
            or (lit.origin = 'ai' and lit.analysis_run_id = ${libraryItems.activeAnalysisRunId})
          )
          and t.display_label ilike ${term} escape '\\'
      )
      or exists (
        select 1 from ai_analysis_runs ar
        where ar.id = ${libraryItems.activeAnalysisRunId}
          and ar.validated_result::text ilike ${term} escape '\\'
      )
    )`;
    const filters = [
      isNull(libraryItems.deletedAt),
      ...(input.q.trim() ? [match] : []),
      ...(input.favourite === undefined
        ? []
        : [sql<boolean>`${libraryItems.favourite} = ${input.favourite}`]),
      ...(input.reviewed === undefined
        ? []
        : [sql<boolean>`${libraryItems.reviewed} = ${input.reviewed}`]),
      ...(input.collectionId
        ? [
            sql<boolean>`exists (
              select 1 from collection_items ci
              where ci.library_item_id = ${libraryItems.id}
                and ci.collection_id = ${input.collectionId}
            )`,
          ]
        : []),
    ];
    const where = and(...filters);
    const [{ value: total = 0 } = { value: 0 }] = await this.db
      .select({ value: count() })
      .from(libraryItems)
      .where(where);
    const rows = await this.db
      .select({ id: libraryItems.id })
      .from(libraryItems)
      .where(where)
      .orderBy(desc(libraryItems.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
    const items = await Promise.all(rows.map(({ id }) => this.items.summary(id)));
    return { items, page, pageSize, total, hasNextPage: page * pageSize < total };
  }
}
