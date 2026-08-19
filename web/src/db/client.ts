import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { drizzle } from "drizzle-orm/node-sqlite";
import * as schema from "./schema";

export function createDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  return drizzle({ client: new DatabaseSync(filename), schema } as never);
}

export type AppDatabase = ReturnType<typeof createDatabase>;
export const db = createDatabase(process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite");
