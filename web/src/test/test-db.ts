import path from "node:path";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";

export function createTestDatabase() {
  const db = createDatabase(":memory:");
  migrateDatabase(db, path.resolve(process.cwd(), "drizzle"));
  return db;
}
