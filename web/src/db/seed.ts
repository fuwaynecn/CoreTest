import path from "node:path";
import { hashCredential } from "@/domain/auth/credentials";
import { getDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { users } from "./schema";

async function seed() {
  const parentPassword = process.env.PARENT_PASSWORD;
  const childPin = process.env.CHILD_PIN;

  if (!parentPassword || !childPin) {
    throw new Error("PARENT_PASSWORD and CHILD_PIN must both be set");
  }

  const [parentCredentialHash, childCredentialHash] = await Promise.all([
    hashCredential(parentPassword),
    hashCredential(childPin),
  ]);
  const db = getDatabase();
  migrateDatabase(db, path.resolve(process.cwd(), "drizzle"));
  const createdAt = Date.now();

  await db.insert(users).values({
    id: "parent",
    role: "parent",
    displayName: "家长",
    credentialHash: parentCredentialHash,
    createdAt,
  }).onConflictDoUpdate({
    target: users.id,
    set: {
      role: "parent",
      displayName: "家长",
      credentialHash: parentCredentialHash,
    },
  });
  await db.insert(users).values({
    id: "child",
    role: "child",
    displayName: "孩子",
    credentialHash: childCredentialHash,
    createdAt,
  }).onConflictDoUpdate({
    target: users.id,
    set: {
      role: "child",
      displayName: "孩子",
      credentialHash: childCredentialHash,
    },
  });
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Database seed failed: ${message}\n`);
  process.exitCode = 1;
});
