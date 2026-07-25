import { Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import sharp from "sharp";
import { loadConfig } from "../../config.js";

export class InvalidImageError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export type InspectedImage = {
  hash: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
  width: number;
  height: number;
  fileSize: number;
};

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly config = loadConfig();
  private readonly root = resolve(this.config.STORAGE_ROOT);
  private readonly originals = resolve(this.root, "originals");
  private readonly thumbnails = resolve(this.root, "thumbnails");
  private readonly temporary = resolve(this.root, ".tmp");

  async onModuleInit(): Promise<void> {
    await Promise.all([
      mkdir(this.originals, { recursive: true }),
      mkdir(this.thumbnails, { recursive: true }),
      mkdir(this.temporary, { recursive: true }),
    ]);
  }

  get displayPath(): string {
    return this.root;
  }

  get maximumUploadBytes(): number {
    return this.config.MAX_UPLOAD_BYTES;
  }

  async health(): Promise<boolean> {
    try {
      const probe = resolve(this.temporary, `.probe-${randomUUID()}`);
      await writeFile(probe, "");
      await rm(probe);
      return true;
    } catch {
      return false;
    }
  }

  async inspect(buffer: Buffer): Promise<InspectedImage> {
    if (buffer.length > this.config.MAX_UPLOAD_BYTES) {
      throw new InvalidImageError("FILE_TOO_LARGE", "The image exceeds the upload limit.");
    }
    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(buffer, {
        animated: true,
        limitInputPixels: this.config.MAX_IMAGE_PIXELS,
      }).metadata();
    } catch {
      throw new InvalidImageError(
        "INVALID_IMAGE",
        "The file is corrupt or is not a supported image.",
      );
    }
    if (!metadata.width || !metadata.height) {
      throw new InvalidImageError("INVALID_IMAGE", "The image dimensions could not be read.");
    }
    if ((metadata.pages ?? 1) > 1) {
      throw new InvalidImageError("ANIMATED_IMAGE", "Animated images are not supported.");
    }
    const detected =
      metadata.format === "jpeg"
        ? ({ mimeType: "image/jpeg", extension: "jpg" } as const)
        : metadata.format === "png"
          ? ({ mimeType: "image/png", extension: "png" } as const)
          : metadata.format === "webp"
            ? ({ mimeType: "image/webp", extension: "webp" } as const)
            : null;
    if (!detected) {
      throw new InvalidImageError(
        "UNSUPPORTED_FORMAT",
        "Only JPEG, PNG, and static WebP are supported.",
      );
    }
    const orientationSwapsDimensions = [5, 6, 7, 8].includes(metadata.orientation ?? 1);
    return {
      hash: createHash("sha256").update(buffer).digest("hex"),
      ...detected,
      width: orientationSwapsDimensions ? metadata.height : metadata.width,
      height: orientationSwapsDimensions ? metadata.width : metadata.height,
      fileSize: buffer.length,
    };
  }

  async save(
    buffer: Buffer,
    info: InspectedImage,
  ): Promise<{ storageKey: string; thumbnailKey: string }> {
    const id = randomUUID();
    const storageKey = `originals/${id}.${info.extension}`;
    const thumbnailKey = `thumbnails/${id}.webp`;
    const originalPath = this.resolveKey(storageKey);
    const thumbnailPath = this.resolveKey(thumbnailKey);
    const tempOriginal = resolve(this.temporary, `${id}.${info.extension}`);
    const tempThumbnail = resolve(this.temporary, `${id}.webp`);
    try {
      await writeFile(tempOriginal, buffer, { flag: "wx" });
      await sharp(buffer, { limitInputPixels: this.config.MAX_IMAGE_PIXELS })
        .rotate()
        .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(tempThumbnail);
      await rename(tempOriginal, originalPath);
      await rename(tempThumbnail, thumbnailPath);
      return { storageKey, thumbnailKey };
    } catch (error) {
      await Promise.all([rm(tempOriginal, { force: true }), rm(tempThumbnail, { force: true })]);
      throw error;
    }
  }

  async remove(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.resolveKey(key), { force: true })));
  }

  async read(key: string): Promise<Buffer> {
    return readFile(this.resolveKey(key));
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }

  resolveKey(key: string): string {
    if (!key || key.includes("\0") || extname(key).length > 8) {
      throw new InvalidImageError("INVALID_STORAGE_KEY", "Invalid storage key.");
    }
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new InvalidImageError("INVALID_STORAGE_KEY", "Invalid storage key.");
    }
    return path;
  }
}
