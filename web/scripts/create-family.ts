import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { createDatabase, type AppDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { hashCredential } from "@/domain/auth/credentials";
import { users } from "@/db/schema";

export type CreateFamilyInput = { loginName: string; displayName: string; password: string };

export async function createFamilyParent(db: AppDatabase, input: CreateFamilyInput): Promise<string> {
  if (db.select({ id: users.id }).from(users).where(eq(users.loginName, input.loginName)).get()) {
    throw new Error("登录名已被使用");
  }
  const id = randomUUID();
  const credentialHash = await hashCredential(input.password);
  db.insert(users).values({
    id,
    role: "parent",
    displayName: input.displayName,
    credentialHash,
    createdAt: Date.now(),
    loginName: input.loginName,
    edition: "pep",
    isAdmin: false,
  }).run();
  return id;
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url;
}

if (isDirectExecution()) {
  (async () => {
    try {
      const { values } = parseArgs({
        options: {
          "login-name": { type: "string" },
          "display-name": { type: "string" },
          "password": { type: "string" },
        },
        strict: true,
        allowPositionals: false,
      });

      const loginName = values["login-name"];
      const displayName = values["display-name"];
      const password = values["password"];

      if (!loginName || !displayName || !password) {
        process.stderr.write("用法: node scripts/create-family.ts --login-name=<name> --display-name=<name> --password=<pwd>\n");
        process.exitCode = 1;
        return;
      }

      const dbPath = process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite";
      const db = createDatabase(dbPath);
      try {
        migrateDatabase(db, path.resolve(process.cwd(), "drizzle"));
        await createFamilyParent(db, { loginName, displayName, password });
        process.stdout.write(`家长账号已创建：${loginName}\n`);
      } finally {
        db.$client.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "登录名已被使用") {
        process.stderr.write("登录名已被使用\n");
      } else {
        process.stderr.write(`错误：${message}\n`);
      }
      process.exitCode = 1;
    }
  })();
}
