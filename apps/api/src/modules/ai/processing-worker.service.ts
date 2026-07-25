import { Inject, Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { loadConfig } from "../../config.js";
import { ProcessingJobsService } from "../processing-jobs/processing-jobs.service.js";
import type { ProcessingJob } from "../processing-jobs/processing-job.types.js";
import { AnalysisExecutionService } from "./analysis-execution.service.js";
import { AnalyzerError } from "./analyzer.types.js";

const POLL_INTERVAL_MS = 1_000;

@Injectable()
export class ProcessingWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessingWorker.name);
  private readonly config = loadConfig();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    @Inject(ProcessingJobsService) private readonly jobs: ProcessingJobsService,
    @Inject(AnalysisExecutionService) private readonly execution: AnalysisExecutionService,
  ) {}

  onModuleInit(): void {
    if (!this.config.PROCESSING_WORKER_ENABLED || this.config.AI_PROVIDER === "disabled") return;
    this.stopped = false;
    void this.start();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async start(): Promise<void> {
    const providerTimeoutMs = Math.max(
      this.config.OLLAMA_TIMEOUT_MS,
      this.config.GEMINI_TIMEOUT_MS,
    );
    const staleMs = Math.max(providerTimeoutMs + 60_000, 5 * 60_000);
    try {
      const recovered = await this.jobs.recoverStale(new Date(Date.now() - staleMs));
      if (recovered) this.logger.warn(`Recovered ${recovered} stale processing job(s).`);
    } catch (error) {
      this.logger.error("Could not recover stale processing jobs.", error);
    }
    this.schedule(0);
  }

  private schedule(delayMs = POLL_INTERVAL_MS): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return this.schedule();
    this.running = true;
    try {
      const job = await this.jobs.claimNext();
      if (job) await this.process(job);
    } catch (error) {
      this.logger.error(
        "Processing worker tick failed.",
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
      this.schedule();
    }
  }

  private async process(job: ProcessingJob): Promise<void> {
    try {
      await this.execution.execute(job);
      await this.jobs.markCompleted(job.id);
    } catch (error) {
      const retryable = error instanceof AnalyzerError ? error.retryable : true;
      const message = error instanceof Error ? error.message : "Analysis failed.";
      await this.jobs.markFailed(job, message, retryable);
      this.logger.warn(`Analysis job ${job.id} failed: ${message}`);
    }
  }
}
