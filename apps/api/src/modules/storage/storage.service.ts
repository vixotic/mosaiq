import { Injectable } from "@nestjs/common";
import type { OnModuleInit } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import sharp from "sharp";
import { loadConfig } from "../../config.js";
import {
  FilesystemStorageBackend,
  OciObjectStorageBackend,
  type BinaryStorageBackend,
} from "./storage-backend.js";

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
  private readonly backend: BinaryStorageBackend =
    this.config.STORAGE_DRIVER === "oci"
      ? new OciObjectStorageBackend({
          namespaceName: this.config.OCI_OBJECT_STORAGE_NAMESPACE,
          bucketName: this.config.OCI_OBJECT_STORAGE_BUCKET,
          region: this.config.OCI_OBJECT_STORAGE_REGION,
          prefix: this.config.OCI_OBJECT_STORAGE_PREFIX,
          authMode: this.config.OCI_AUTH_MODE,
          ...(this.config.OCI_CONFIG_FILE ? { configFile: this.config.OCI_CONFIG_FILE } : {}),
          configProfile: this.config.OCI_CONFIG_PROFILE,
        })
      : new FilesystemStorageBackend(this.root);

  async onModuleInit(): Promise<void> {
    await this.backend.initialize();
  }

  get displayPath(): string {
    return this.backend.displayPath;
  }

  get maximumUploadBytes(): number {
    return this.config.MAX_UPLOAD_BYTES;
  }

  async health(): Promise<boolean> {
    return this.backend.health();
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
    const thumbnail = await sharp(buffer, { limitInputPixels: this.config.MAX_IMAGE_PIXELS })
      .rotate()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    const writtenKeys: string[] = [];
    try {
      await this.backend.write(storageKey, buffer, info.mimeType);
      writtenKeys.push(storageKey);
      await this.backend.write(thumbnailKey, thumbnail, "image/webp");
      writtenKeys.push(thumbnailKey);
      return { storageKey, thumbnailKey };
    } catch (error) {
      await this.backend.remove(writtenKeys).catch(() => undefined);
      throw error;
    }
  }

  async remove(keys: string[]): Promise<void> {
    keys.forEach((key) => this.assertValidKey(key));
    await this.backend.remove(keys);
  }

  async read(key: string): Promise<Buffer> {
    this.assertValidKey(key);
    return this.backend.read(key);
  }

  async exists(key: string): Promise<boolean> {
    this.assertValidKey(key);
    return this.backend.exists(key);
  }

  resolveKey(key: string): string {
    this.assertValidKey(key);
    return resolve(this.root, key);
  }

  private assertValidKey(key: string): void {
    if (!key || key.includes("\0") || extname(key).length > 8) {
      throw new InvalidImageError("INVALID_STORAGE_KEY", "Invalid storage key.");
    }
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new InvalidImageError("INVALID_STORAGE_KEY", "Invalid storage key.");
    }
  }
}
