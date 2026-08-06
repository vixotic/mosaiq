import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { OciObjectStorageBackend } from "./storage-backend.js";

const options = {
  namespaceName: "example-namespace",
  bucketName: "mosaiq-images",
  region: "ap-hyderabad-1",
  prefix: "/private-library/",
  authMode: "instance_principal" as const,
  configProfile: "DEFAULT",
};

const fakeClient = () => ({
  headBucket: vi.fn().mockResolvedValue({}),
  putObject: vi.fn().mockResolvedValue({}),
  getObject: vi.fn().mockResolvedValue({ value: Readable.from([Buffer.from("stored")]) }),
  headObject: vi.fn().mockResolvedValue({}),
  deleteObject: vi.fn().mockResolvedValue({}),
});

describe("OciObjectStorageBackend", () => {
  it("stores private objects beneath the configured prefix with integrity metadata", async () => {
    const client = fakeClient();
    const backend = new OciObjectStorageBackend(options, async () => client as never);

    await backend.initialize();
    await backend.write("originals/example.png", Buffer.from("image"), "image/png");

    expect(client.headBucket).toHaveBeenCalledWith({
      namespaceName: "example-namespace",
      bucketName: "mosaiq-images",
    });
    expect(client.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        namespaceName: "example-namespace",
        bucketName: "mosaiq-images",
        objectName: "private-library/originals/example.png",
        contentLength: 5,
        contentType: "image/png",
        ifNoneMatch: "*",
      }),
    );
    expect(client.putObject.mock.calls[0]?.[0].contentMD5).toBe("eIBaIhqYjnnvP0LXxb/UGA==");
  });

  it("reads object streams and treats missing objects as absent", async () => {
    const client = fakeClient();
    client.headObject.mockRejectedValueOnce({ statusCode: 404 });
    const backend = new OciObjectStorageBackend(options, async () => client as never);

    await expect(backend.read("originals/example.png")).resolves.toEqual(Buffer.from("stored"));
    await expect(backend.exists("originals/missing.png")).resolves.toBe(false);
  });

  it("removes every requested object and ignores already-missing keys", async () => {
    const client = fakeClient();
    client.deleteObject.mockRejectedValueOnce({ statusCode: 404 });
    const backend = new OciObjectStorageBackend(options, async () => client as never);

    await expect(
      backend.remove(["originals/missing.png", "thumbnails/example.webp"]),
    ).resolves.toBeUndefined();
    expect(client.deleteObject).toHaveBeenCalledTimes(2);
  });
});
