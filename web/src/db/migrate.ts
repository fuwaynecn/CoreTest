import { migrate } from "drizzle-orm/node-sqlite/migrator";
import type { AppDatabase } from "./client";

export function migrateDatabase(db: AppDatabase, migrationsFolder: string) {
  migrate(db, { migrationsFolder });
}
