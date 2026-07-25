import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "dotenv";
import { createDatabase } from "./client.js";

config({ path: new URL("../../../.env", import.meta.url), quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required");
}

const { db, client } = createDatabase(connectionString);
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await client.end();
