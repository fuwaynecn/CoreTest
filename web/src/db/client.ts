import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { defineRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import * as schema from "./schema";

const relations = defineRelations(schema);

export function createDatabase(filename: string) {
  if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
  return drizzle({ client: new DatabaseSync(filename), relations });
}

export type AppDatabase = ReturnType<typeof createDatabase>;

let database: AppDatabase | undefined;

export function getDatabase() {
  return database ??= createDatabase(process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite");
}
