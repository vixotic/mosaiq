import { Inject, Injectable } from "@nestjs/common";
import type postgres from "postgres";
import { DATABASE_CLIENT } from "../../database.provider.js";
import { ANALYSIS_JOB_TYPE, type ProcessingJob } from "./processing-job.types.js";

const RETRY_BASE_DELAY_MS = 5_000;

@Injectable()
export class ProcessingJobsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly sql: postgres.Sql) {}

  async enqueue(
    libraryItemId: string,
    providerId: string,
    jobType = ANALYSIS_JOB_TYPE,
  ): Promise<ProcessingJob | null> {
    const rows = await this.sql<ProcessingJob[]>`
      insert into processing_jobs (library_item_id, provider_id, job_type)
      values (${libraryItemId}, ${providerId}, ${jobType})
      on conflict do nothing
      returning ${this.jobColumns()}
    `;
    if (rows[0]) return rows[0];
    const existing = await this.sql<ProcessingJob[]>`
      select ${this.jobColumns()}
      from processing_jobs
      where library_item_id = ${libraryItemId}
        and provider_id = ${providerId}
        and job_type = ${jobType}
        and status in ('pending', 'processing')
      order by created_at desc
      limit 1
    `;
    return existing[0] ?? null;
  }

  async claimNext(): Promise<ProcessingJob | null> {
    const rows = await this.sql<ProcessingJob[]>`
      with candidate as (
        select id
        from processing_jobs
        where status = 'pending'
          and available_at <= now()
        order by available_at asc, created_at asc
        for update skip locked
        limit 1
      )
      update processing_jobs as job
      set status = 'processing',
          attempt_count = job.attempt_count + 1,
          locked_at = now(),
          started_at = coalesce(job.started_at, now()),
          updated_at = now()
      from candidate
      where job.id = candidate.id
      returning ${this.jobColumns("job")}
    `;
    return rows[0] ?? null;
  }

  async markCompleted(jobId: string): Promise<void> {
    await this.sql`
      update processing_jobs
      set status = 'completed',
          locked_at = null,
          completed_at = now(),
          last_error = null,
          updated_at = now()
      where id = ${jobId}
    `;
  }

  async markFailed(job: ProcessingJob, message: string, retryable: boolean): Promise<void> {
    const shouldRetry = retryable && job.attemptCount < job.maxAttempts;
    const retryDelay = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, job.attemptCount - 1);
    const availableAt = shouldRetry ? new Date(Date.now() + retryDelay) : job.availableAt;
    const availableAtIso =
      availableAt instanceof Date ? availableAt.toISOString() : String(availableAt);
    const completedAtIso = shouldRetry ? null : new Date().toISOString();
    await this.sql`
      update processing_jobs
      set status = ${shouldRetry ? "pending" : "failed"},
          available_at = ${availableAtIso},
          locked_at = null,
          completed_at = ${completedAtIso},
          last_error = ${message.slice(0, 10_000)},
          updated_at = now()
      where id = ${job.id}
    `;
  }

  async retry(jobId: string): Promise<ProcessingJob | null> {
    const rows = await this.sql<ProcessingJob[]>`
      update processing_jobs
      set status = 'pending',
          attempt_count = 0,
          available_at = now(),
          locked_at = null,
          started_at = null,
          completed_at = null,
          last_error = null,
          updated_at = now()
      where id = ${jobId}
        and status = 'failed'
      returning ${this.jobColumns()}
    `;
    return rows[0] ?? null;
  }

  async retryLatestForItem(libraryItemId: string): Promise<ProcessingJob | null> {
    const rows = await this.sql<ProcessingJob[]>`
      with latest_failed as (
        select id
        from processing_jobs
        where library_item_id = ${libraryItemId}
          and status = 'failed'
        order by created_at desc
        limit 1
      )
      update processing_jobs as job
      set status = 'pending',
          attempt_count = 0,
          available_at = now(),
          locked_at = null,
          started_at = null,
          completed_at = null,
          last_error = null,
          updated_at = now()
      from latest_failed
      where job.id = latest_failed.id
      returning ${this.jobColumns("job")}
    `;
    return rows[0] ?? null;
  }

  async recoverStale(staleBefore: Date): Promise<number> {
    const staleBeforeIso = staleBefore.toISOString();
    const rows = await this.sql<Array<{ id: string }>>`
      update processing_jobs
      set status = case when attempt_count >= max_attempts then 'failed' else 'pending' end,
          available_at = now(),
          locked_at = null,
          completed_at = case when attempt_count >= max_attempts then now() else null end,
          last_error = concat_ws(
            E'\n',
            nullif(last_error, ''),
            'Recovered after the worker stopped while processing.'
          ),
          updated_at = now()
      where status = 'processing'
        and locked_at < ${staleBeforeIso}
      returning id
    `;
    return rows.length;
  }

  async get(jobId: string): Promise<ProcessingJob | null> {
    const rows = await this.sql<ProcessingJob[]>`
      select ${this.jobColumns()}
      from processing_jobs
      where id = ${jobId}
      limit 1
    `;
    return rows[0] ?? null;
  }

  private jobColumns(alias?: string): ReturnType<postgres.Sql["unsafe"]> {
    const prefix = alias ? `${alias}.` : "";
    return this.sql.unsafe(`
      ${prefix}id,
      ${prefix}library_item_id as "libraryItemId",
      ${prefix}provider_id as "providerId",
      ${prefix}job_type as "jobType",
      ${prefix}status,
      ${prefix}attempt_count as "attemptCount",
      ${prefix}max_attempts as "maxAttempts",
      ${prefix}available_at as "availableAt",
      ${prefix}locked_at as "lockedAt",
      ${prefix}started_at as "startedAt",
      ${prefix}completed_at as "completedAt",
      ${prefix}last_error as "lastError",
      ${prefix}created_at as "createdAt",
      ${prefix}updated_at as "updatedAt"
    `);
  }
}
