import { Module } from "@nestjs/common";
import { databaseProviders } from "../../database.provider.js";
import { ProcessingJobsModule } from "../processing-jobs/processing-jobs.module.js";
import { AiProvidersController } from "./ai-providers.controller.js";
import { AnalysisExecutionService } from "./analysis-execution.service.js";
import { AnalyzerRegistry } from "./analyzer-registry.service.js";
import { GeminiImageAnalyzer } from "./gemini-image-analyzer.js";
import { MockImageAnalyzer } from "./mock-image-analyzer.js";
import { OllamaImageAnalyzer } from "./ollama-image-analyzer.js";
import { ProcessingWorker } from "./processing-worker.service.js";

@Module({
  imports: [ProcessingJobsModule],
  controllers: [AiProvidersController],
  providers: [
    ...databaseProviders,
    MockImageAnalyzer,
    OllamaImageAnalyzer,
    GeminiImageAnalyzer,
    AnalyzerRegistry,
    AnalysisExecutionService,
    ProcessingWorker,
  ],
  exports: [AnalyzerRegistry, ProcessingJobsModule],
})
export class AiModule {}
