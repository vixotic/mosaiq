import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve, sep } from "node:path";
import type { AuthenticationDetailsProvider } from "oci-common";
import type { ObjectStorageClient } from "oci-objectstorage";

export interface BinaryStorageBackend {
  readonly displayPath: string;
  initialize(): Promise<void>;
  health(): Promise<boolean>;
  write(key: string, bytes: Buffer, contentType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  remove(keys: string[]): Promise<void>;
}

export class FilesystemStorageBackend implements BinaryStorageBackend {
  private readonly temporary: string;

  constructor(private readonly root: string) {
    this.temporary = resolve(root, ".tmp");
  }

  get displayPath(): string {
    return this.root;
  }

  async initialize(): Promise<void> {
    await Promise.all([
      mkdir(resolve(this.root, "originals"), { recursive: true }),
      mkdir(resolve(this.root, "thumbnails"), { recursive: true }),
      mkdir(this.temporary, { recursive: true }),
    ]);
  }

  async health(): Promise<boolean> {
    const probe = resolve(this.temporary, `.probe-${randomUUID()}`);
    try {
      await writeFile(probe, "", { flag: "wx" });
      await rm(probe);
      return true;
    } catch {
      return false;
    }
  }

  async write(key: string, bytes: Buffer): Promise<void> {
    const target = this.resolveKey(key);
    const temporary = resolve(this.temporary, `${basename(key)}-${randomUUID()}`);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: "wx" });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  read(key: string): Promise<Buffer> {
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

  async remove(keys: string[]): Promise<void> {
    await Promise.all(keys.map((key) => rm(this.resolveKey(key), { force: true })));
  }

  resolveKey(key: string): string {
    const path = resolve(this.root, key);
    if (path !== this.root && !path.startsWith(`${this.root}${sep}`)) {
      throw new Error("Invalid storage key.");
    }
    return path;
  }
}

export type OciStorageOptions = {
  namespaceName: string;
  bucketName: string;
  region: string;
  prefix: string;
  authMode: "instance_principal" | "config_file";
  configFile?: string;
  configProfile: string;
};

type OciObjectStorageClient = Pick<
  ObjectStorageClient,
  "headBucket" | "putObject" | "getObject" | "headObject" | "deleteObject"
>;

type OciClientFactory = () => Promise<OciObjectStorageClient>;

export class OciObjectStorageBackend implements BinaryStorageBackend {
  private clientPromise: Promise<OciObjectStorageClient> | null = null;

  constructor(
    private readonly options: OciStorageOptions,
    private readonly clientFactory: OciClientFactory = () => this.createClient(),
  ) {}

  get displayPath(): string {
    const prefix = this.normalizedPrefix();
    return `oci://${this.options.namespaceName}/${this.options.bucketName}/${prefix}`;
  }

  async initialize(): Promise<void> {
    const client = await this.client();
    await client.headBucket({
      namespaceName: this.options.namespaceName,
      bucketName: this.options.bucketName,
    });
  }

  async health(): Promise<boolean> {
    try {
      await this.initialize();
      return true;
    } catch {
      return false;
    }
  }

  async write(key: string, bytes: Buffer, contentType: string): Promise<void> {
    const client = await this.client();
    await client.putObject({
      namespaceName: this.options.namespaceName,
      bucketName: this.options.bucketName,
      objectName: this.objectName(key),
      putObjectBody: bytes,
      contentLength: bytes.length,
      contentType,
      contentMD5: createHash("md5").update(bytes).digest("base64"),
      ifNoneMatch: "*",
    });
  }

  async read(key: string): Promise<Buffer> {
    const client = await this.client();
    const response = await client.getObject({
      namespaceName: this.options.namespaceName,
      bucketName: this.options.bucketName,
      objectName: this.objectName(key),
    });
    return streamToBuffer(response.value);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.client();
      await client.headObject({
        namespaceName: this.options.namespaceName,
        bucketName: this.options.bucketName,
        objectName: this.objectName(key),
      });
      return true;
    } catch (error) {
      if (isOciNotFound(error)) return false;
      throw error;
    }
  }

  async remove(keys: string[]): Promise<void> {
    const client = await this.client();
    await Promise.all(
      keys.map(async (key) => {
        try {
          await client.deleteObject({
            namespaceName: this.options.namespaceName,
            bucketName: this.options.bucketName,
            objectName: this.objectName(key),
          });
        } catch (error) {
          if (!isOciNotFound(error)) throw error;
        }
      }),
    );
  }

  private client(): Promise<OciObjectStorageClient> {
    this.clientPromise ??= this.clientFactory();
    return this.clientPromise;
  }

  private async createClient(): Promise<ObjectStorageClient> {
    const [common, objectstorage] = await Promise.all([
      import("oci-common"),
      import("oci-objectstorage"),
    ]);
    let authenticationDetailsProvider: AuthenticationDetailsProvider;
    if (this.options.authMode === "instance_principal") {
      authenticationDetailsProvider =
        await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build();
    } else {
      authenticationDetailsProvider = new common.ConfigFileAuthenticationDetailsProvider(
        this.options.configFile,
        this.options.configProfile,
      );
    }
    const client = new objectstorage.ObjectStorageClient({ authenticationDetailsProvider });
    client.regionId = this.options.region;
    return client;
  }

  private objectName(key: string): string {
    return `${this.normalizedPrefix()}${key}`;
  }

  private normalizedPrefix(): string {
    const prefix = this.options.prefix.replace(/^\/+|\/+$/g, "");
    return prefix ? `${prefix}/` : "";
  }
}

const isOciNotFound = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;

const streamToBuffer = async (value: NodeJS.ReadableStream | ReadableStream): Promise<Buffer> => {
  if (Symbol.asyncIterator in value) {
    const chunks: Buffer[] = [];
    for await (const chunk of value as AsyncIterable<Uint8Array | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  const reader = (value as ReadableStream<Uint8Array>).getReader();
  const chunks: Buffer[] = [];
  while (true) {
    const { done, value: chunk } = await reader.read();
    if (done) return Buffer.concat(chunks);
    chunks.push(Buffer.from(chunk));
  }
};
