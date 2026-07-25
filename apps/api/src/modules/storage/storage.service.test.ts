import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InvalidImageError, StorageService } from "./storage.service.js";

let root = "";

describe("StorageService", () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mosaiq-storage-"));
    process.env.STORAGE_ROOT = root;
    process.env.DATABASE_URL ||= "postgres://example.invalid/test";
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("detects actual image content and preserves original bytes", async () => {
    const input = await sharp({
      create: { width: 100, height: 80, channels: 4, background: "#ff00aaff" },
    })
      .png()
      .toBuffer();
    const storage = new StorageService();
    await storage.onModuleInit();
    const inspected = await storage.inspect(input);
    expect(inspected.mimeType).toBe("image/png");
    const saved = await storage.save(input, inspected);
    expect(await readFile(storage.resolveKey(saved.storageKey))).toEqual(input);
    expect((await sharp(storage.resolveKey(saved.thumbnailKey)).metadata()).format).toBe("webp");
  });

  it("rejects invalid content regardless of filename", async () => {
    const storage = new StorageService();
    await expect(storage.inspect(Buffer.from("not a jpeg"))).rejects.toBeInstanceOf(InvalidImageError);
  });

  it("prevents storage traversal", () => {
    const storage = new StorageService();
    expect(() => storage.resolveKey("../../private")).toThrow(InvalidImageError);
  });
});
