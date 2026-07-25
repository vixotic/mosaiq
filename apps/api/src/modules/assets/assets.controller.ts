import { Controller, Get, Inject, NotFoundException, Param, Res } from "@nestjs/common";
import type { Database } from "@mosaiq/database";
import { assets } from "@mosaiq/database";
import { eq } from "drizzle-orm";
import type { Response } from "express";
import { DATABASE } from "../../database.provider.js";
import { StorageService } from "../storage/storage.service.js";

@Controller("assets")
export class AssetsController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  @Get(":id/thumbnail")
  thumbnail(@Param("id") id: string, @Res() response: Response) {
    return this.serve(id, true, response);
  }

  @Get(":id/original")
  original(@Param("id") id: string, @Res() response: Response) {
    return this.serve(id, false, response);
  }

  private async serve(id: string, thumbnail: boolean, response: Response): Promise<void> {
    const [asset] = await this.db.select().from(assets).where(eq(assets.id, id)).limit(1);
    if (!asset) throw new NotFoundException("Asset not found.");
    try {
      const bytes = await this.storage.read(thumbnail ? asset.thumbnailKey : asset.storageKey);
      response
        .set({
          "Content-Type": thumbnail ? "image/webp" : asset.mimeType,
          "Cache-Control": "private, max-age=31536000, immutable",
          ETag: `"${asset.contentHash}${thumbnail ? "-thumbnail" : ""}"`,
          "X-Content-Type-Options": "nosniff",
        })
        .send(bytes);
    } catch {
      throw new NotFoundException("Asset file not found.");
    }
  }
}
