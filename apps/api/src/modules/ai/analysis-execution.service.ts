import { Inject, Injectable } from "@nestjs/common";
import type { AnalysisResult } from "@mosaiq/shared";
import type postgres from "postgres";
import sharp from "sharp";
import { DATABASE_CLIENT } from "../../database.provider.js";
import type { ProcessingJob } from "../processing-jobs/processing-job.types.js";
import { StorageService } from "../storage/storage.service.js";
import { AnalyzerError } from "./analyzer.types.js";
import { AnalyzerRegistry } from "./analyzer-registry.service.js";

const PROMPT_VERSION = "visual-metadata-v1";
const SCHEMA_VERSION = "analysis-result-v1";
const ANALYSIS_MAX_EDGE = 1600;
const MAX_RAW_RESPONSE_CHARS = 256 * 1024;

type ItemForAnalysis = {
  libraryItemId: string;
  filename: string;
  storageKey: string;
  mimeType: string;
};

const normalizeTag = (label: string): string =>
  label.trim().replace(/\s+/g, " ").toLocaleLowerCase();

@Injectable()
export class AnalysisExecutionService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly sql: postgres.Sql,
    @Inject(AnalyzerRegistry) private readonly registry: AnalyzerRegistry,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async execute(job: ProcessingJob): Promise<void> {
    let analyzer;
    try {
      analyzer = this.registry.get(job.providerId);
    } catch (error) {
      throw new AnalyzerError(
        error instanceof Error ? error.message : "Unknown AI provider.",
        false,
      );
    }

    const items = await this.sql<ItemForAnalysis[]>`
      select
        item.id as "libraryItemId",
        item.original_filename as filename,
        asset.storage_key as "storageKey",
        asset.mime_type as "mimeType"
      from library_items item
      join assets asset on asset.id = item.asset_id
      where item.id = ${job.libraryItemId}
        and item.deleted_at is null
      limit 1
    `;
    const item = items[0];
    if (!item) throw new AnalyzerError("Library item was not found or is deleted.", false);

    const runs = await this.sql<Array<{ id: string }>>`
      insert into ai_analysis_runs (
        library_item_id, provider_id, model, prompt_version, schema_version, status
      )
      values (
        ${item.libraryItemId},
        ${analyzer.id},
        ${analyzer.getCapabilities().model},
        ${PROMPT_VERSION},
        ${SCHEMA_VERSION},
        'processing'
      )
      returning id
    `;
    const run = runs[0];
    if (!run) throw new Error("Failed to create the analysis run.");

    try {
      const source = await this.storage.read(item.storageKey);
      const image = await sharp(source, { failOn: "error" })
        .rotate()
        .resize({
          width: ANALYSIS_MAX_EDGE,
          height: ANALYSIS_MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer();
      const result = await analyzer.analyze({
        image,
        mimeType: "image/jpeg",
        filename: item.filename,
      });
      await this.activateResult(run.id, item.libraryItemId, result);
    } catch (error) {
      const analyzerError =
        error instanceof AnalyzerError
          ? error
          : new AnalyzerError(
              error instanceof Error ? error.message : "Image analysis failed.",
              true,
            );
      await this.sql`
        update ai_analysis_runs
        set status = 'failed',
            raw_response = ${analyzerError.rawResponse?.slice(0, MAX_RAW_RESPONSE_CHARS) ?? null},
            parse_error = ${analyzerError.parseError?.slice(0, 10_000) ?? null},
            error_message = ${analyzerError.message.slice(0, 10_000)},
            completed_at = now()
        where id = ${run.id}
      `;
      throw analyzerError;
    }
  }

  private async activateResult(
    runId: string,
    libraryItemId: string,
    result: AnalysisResult,
  ): Promise<void> {
    const persistedResult = JSON.parse(JSON.stringify(result));
    await this.sql.begin(async (transaction) => {
      const tagEntries = [
        ...new Map(
          result.tags
            .map((displayLabel) => ({
              displayLabel: displayLabel.trim().replace(/\s+/g, " "),
              normalizedLabel: normalizeTag(displayLabel),
            }))
            .filter((entry) => entry.normalizedLabel)
            .map((entry) => [entry.normalizedLabel, entry]),
        ).values(),
      ];

      for (const entry of tagEntries) {
        await transaction`
          insert into tags (normalized_label, display_label)
          values (${entry.normalizedLabel}, ${entry.displayLabel})
          on conflict (normalized_label) do nothing
        `;
        await transaction`
          insert into library_item_tags (
            library_item_id, tag_id, origin, analysis_run_id
          )
          select ${libraryItemId}, id, 'ai', ${runId}
          from tags
          where normalized_label = ${entry.normalizedLabel}
          on conflict do nothing
        `;
      }

      const activatedItems = await transaction<Array<{ id: string }>>`
        update library_items
        set active_analysis_run_id = ${runId},
            updated_at = now()
        where id = ${libraryItemId}
          and deleted_at is null
        returning id
      `;
      if (!activatedItems[0]) {
        throw new AnalyzerError("Library item was deleted while analysis was running.", false);
      }
      await transaction`
        update ai_analysis_runs
        set status = 'completed',
            raw_response = ${JSON.stringify(result).slice(0, MAX_RAW_RESPONSE_CHARS)},
            validated_result = ${JSON.stringify(persistedResult)}::jsonb,
            completed_at = now(),
            became_active = true
        where id = ${runId}
      `;
    });
  }
}
