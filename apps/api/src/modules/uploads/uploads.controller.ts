import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { loadConfig } from "../../config.js";
import { UploadsService } from "./uploads.service.js";

const config = loadConfig();

@Controller("uploads")
export class UploadsController {
  constructor(@Inject(UploadsService) private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor("files", 100, {
      storage: memoryStorage(),
      limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 100 },
    }),
  )
  upload(@UploadedFiles() files: Express.Multer.File[] | undefined) {
    if (!files?.length) throw new BadRequestException("At least one image is required.");
    return this.uploads.upload(files);
  }
}
