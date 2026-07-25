import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { loadConfig } from "../../config.js";
import { ProcessingJobsService } from "./processing-jobs.service.js";

@Controller("processing-jobs")
export class ProcessingJobsController {
  private readonly config = loadConfig();

  constructor(@Inject(ProcessingJobsService) private readonly jobs: ProcessingJobsService) {}

  @Get(":id")
  async get(@Param("id", ParseUUIDPipe) id: string) {
    const job = await this.jobs.get(id);
    if (!job) throw new NotFoundException("Processing job not found.");
    return job;
  }

  @Post(":id/retry")
  async retry(@Param("id", ParseUUIDPipe) id: string) {
    const job = await this.jobs.retry(id);
    if (!job) throw new NotFoundException("Failed processing job not found.");
    return job;
  }

  @Post("library-items/:libraryItemId/reanalyse")
  async reanalyse(
    @Param("libraryItemId", ParseUUIDPipe) libraryItemId: string,
    @Body() body: { providerId?: string } = {},
  ) {
    const providerId = body.providerId ?? this.config.AI_PROVIDER;
    if (providerId === "disabled") {
      return { queued: false, reason: "AI processing is disabled." };
    }
    if (providerId !== "mock" && providerId !== "ollama" && providerId !== "gemini") {
      throw new BadRequestException(`Unknown AI provider "${providerId}".`);
    }
    const job = await this.jobs.enqueue(libraryItemId, providerId);
    return { queued: Boolean(job), job };
  }
}

@Controller("library-items")
export class LibraryItemProcessingController {
  private readonly config = loadConfig();

  constructor(@Inject(ProcessingJobsService) private readonly jobs: ProcessingJobsService) {}

  @Post(":libraryItemId/retry-analysis")
  async retry(@Param("libraryItemId", ParseUUIDPipe) libraryItemId: string) {
    const job = await this.jobs.retryLatestForItem(libraryItemId);
    if (!job) throw new NotFoundException("Failed processing job not found.");
    return job;
  }

  @Post(":libraryItemId/reanalyse")
  async reanalyse(
    @Param("libraryItemId", ParseUUIDPipe) libraryItemId: string,
    @Body() body: { providerId?: string } = {},
  ) {
    const providerId = body.providerId ?? this.config.AI_PROVIDER;
    if (providerId === "disabled") {
      return { queued: false, reason: "AI processing is disabled." };
    }
    if (providerId !== "mock" && providerId !== "ollama" && providerId !== "gemini") {
      throw new BadRequestException(`Unknown AI provider "${providerId}".`);
    }
    const job = await this.jobs.enqueue(libraryItemId, providerId);
    return { queued: Boolean(job), job };
  }
}
