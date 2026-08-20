import { rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { phase2Catalog } from "@/content/phase2-catalog";
import { credentialInputSchema } from "@/domain/auth/credentials";
import { createDatabase } from "@/db/client";
import { requireReviewedCatalog, seedDatabase } from "@/db/seed";

const expectedDatabaseName = ".tmp/e2e.sqlite";

type SeedE2eOptions = {
  catalog?: readonly unknown[];
  parentPassword?: string;
  childPin?: string;
  workingDirectory?: string;
};

export async function seedE2eDatabase(options: SeedE2eOptions = {}) {
  const catalog = requireReviewedCatalog(options.catalog ?? phase2Catalog);
  const parentPassword = options.parentPassword ?? process.env.PARENT_PASSWORD;
  const childPin = options.childPin ?? process.env.CHILD_PIN;

  if (process.env.DB_FILE_NAME !== expectedDatabaseName) {
    throw new Error(`E2E seed requires DB_FILE_NAME=${expectedDatabaseName}`);
  }
  if (!parentPassword || !childPin) {
    throw new Error("PARENT_PASSWORD and CHILD_PIN must both be set");
  }
  if (
    !credentialInputSchema.safeParse(parentPassword).success
    || !credentialInputSchema.safeParse(childPin).success
  ) {
    throw new Error("PARENT_PASSWORD and CHILD_PIN must each be 4-128 characters");
  }

  const workingDirectory = path.resolve(options.workingDirectory ?? process.cwd());
  const databasePath = path.resolve(workingDirectory, expectedDatabaseName);
  const expectedPath = path.resolve(workingDirectory, ".tmp", "e2e.sqlite");
  if (databasePath !== expectedPath) throw new Error("Unexpected E2E database path");

  rmSync(databasePath, { force: true });
  const db = createDatabase(databasePath);

  try {
    await seedDatabase({
      catalog,
      parentPassword,
      childPin,
      openDatabase: () => db,
    });
  } finally {
    db.$client.close();
  }
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url;
}

if (isDirectExecution()) {
  seedE2eDatabase().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`E2E database seed failed: ${message}\n`);
    process.exitCode = 1;
  });
}
