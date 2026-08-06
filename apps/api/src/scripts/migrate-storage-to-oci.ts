import { assets, createDatabase } from "@mosaiq/database";
import { loadConfig } from "../config.js";
import {
  FilesystemStorageBackend,
  OciObjectStorageBackend,
} from "../modules/storage/storage-backend.js";

const config = loadConfig();
for (const [name, value] of Object.entries({
  OCI_OBJECT_STORAGE_NAMESPACE: config.OCI_OBJECT_STORAGE_NAMESPACE,
  OCI_OBJECT_STORAGE_BUCKET: config.OCI_OBJECT_STORAGE_BUCKET,
  OCI_OBJECT_STORAGE_REGION: config.OCI_OBJECT_STORAGE_REGION,
})) {
  if (!value) throw new Error(`${name} is required to migrate storage.`);
}

const source = new FilesystemStorageBackend(config.STORAGE_ROOT);
const destination = new OciObjectStorageBackend({
  namespaceName: config.OCI_OBJECT_STORAGE_NAMESPACE,
  bucketName: config.OCI_OBJECT_STORAGE_BUCKET,
  region: config.OCI_OBJECT_STORAGE_REGION,
  prefix: config.OCI_OBJECT_STORAGE_PREFIX,
  authMode: config.OCI_AUTH_MODE,
  ...(config.OCI_CONFIG_FILE ? { configFile: config.OCI_CONFIG_FILE } : {}),
  configProfile: config.OCI_CONFIG_PROFILE,
});

await Promise.all([source.initialize(), destination.initialize()]);
const { db, client } = createDatabase(config.DATABASE_URL);

try {
  const rows = await db.select().from(assets);
  let copied = 0;
  let skipped = 0;
  for (const asset of rows) {
    for (const object of [
      { key: asset.storageKey, contentType: asset.mimeType },
      { key: asset.thumbnailKey, contentType: "image/webp" },
    ]) {
      if (await destination.exists(object.key)) {
        skipped += 1;
        continue;
      }
      if (!(await source.exists(object.key))) {
        throw new Error(`Local source object is missing: ${object.key}`);
      }
      await destination.write(object.key, await source.read(object.key), object.contentType);
      copied += 1;
    }
  }
  console.log(`OCI migration complete: ${copied} copied, ${skipped} already present.`);
} finally {
  await client.end();
}
