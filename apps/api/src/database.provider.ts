import { createDatabase } from "@mosaiq/database";
import type { Provider } from "@nestjs/common";
import { loadConfig } from "./config.js";

export const DATABASE = Symbol("DATABASE");
export const DATABASE_CLIENT = Symbol("DATABASE_CLIENT");

const connection = createDatabase(loadConfig().DATABASE_URL);

export const databaseProviders: Provider[] = [
  { provide: DATABASE, useValue: connection.db },
  { provide: DATABASE_CLIENT, useValue: connection.client },
];
