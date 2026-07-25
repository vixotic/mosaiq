import { Global, Module } from "@nestjs/common";
import { databaseProviders } from "../../database.provider.js";
import {
  LibraryItemProcessingController,
  ProcessingJobsController,
} from "./processing-jobs.controller.js";
import { ProcessingJobsService } from "./processing-jobs.service.js";

@Global()
@Module({
  controllers: [ProcessingJobsController, LibraryItemProcessingController],
  providers: [...databaseProviders, ProcessingJobsService],
  exports: [ProcessingJobsService],
})
export class ProcessingJobsModule {}
