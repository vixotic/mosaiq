import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProcessingWorker } from "./processing-worker.service.js";
import type { AnalysisExecutionService } from "./analysis-execution.service.js";
import type { ProcessingJobsService } from "../processing-jobs/processing-jobs.service.js";

describe("ProcessingWorker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00.000Z"));
    process.env.PROCESSING_WORKER_ENABLED = "true";
    process.env.AI_PROVIDER = "mock";
    process.env.GEMINI_TIMEOUT_MS = "60000";
    process.env.OLLAMA_TIMEOUT_MS = "120000";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("recovers stale processing jobs before polling after startup", async () => {
    const jobs = {
      recoverStale: vi.fn(async () => 1),
      claimNext: vi.fn(async () => null),
    } as unknown as ProcessingJobsService;
    const execution = {} as AnalysisExecutionService;
    const worker = new ProcessingWorker(jobs, execution);

    worker.onModuleInit();
    await vi.runOnlyPendingTimersAsync();
    worker.onModuleDestroy();

    expect(jobs.recoverStale).toHaveBeenCalledWith(new Date("2026-08-06T11:55:00.000Z"));
    expect(jobs.claimNext).toHaveBeenCalled();
  });
});
