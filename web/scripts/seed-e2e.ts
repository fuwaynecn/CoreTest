import { rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { phase2Catalog } from "@/content/phase2-catalog";
import { credentialInputSchema } from "@/domain/auth/credentials";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { createDatabase } from "@/db/client";
import { requireReviewedCatalog, seedDatabase } from "@/db/seed";
import { questionTemplates, skills } from "@/db/schema";

const expectedDatabaseName = ".tmp/e2e.sqlite";

const phase1Questions = [
  {
    id: "q-decimal-1",
    skillId: "skill-decimal",
    stem: "3.6 + 2.4 = ?",
    answerSpec: { kind: "number", value: 6, tolerance: 0, unit: null },
    explanation: "把十分位对齐相加，结果是 6。",
    difficulty: -2,
    domain: "number_operations",
  },
  {
    id: "q-reading-1",
    skillId: "skill-reading",
    stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。",
    answerSpec: { kind: "number", value: 7.5, tolerance: 0, unit: "元" },
    explanation: "问题问付多少钱，因此答案必须带单位‘元’。",
    difficulty: -1,
    domain: "thinking_habits",
  },
  {
    id: "q-equation-1",
    skillId: "skill-equation",
    stem: "3x + 5 = 26，x 等于多少？",
    answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null },
    explanation: "先从等式两边都减去 5，再把两边都除以 3。",
    difficulty: 0,
    domain: "equation_algebra",
  },
] as const;

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

    for (const skill of [
      { id: "skill-equation", code: "equation", name: "一步方程", domain: "方程与代数意识" },
      { id: "skill-reading", code: "reading", name: "读题与单位", domain: "数学思维与学习习惯" },
    ]) {
      db.insert(skills).values(skill).onConflictDoUpdate({
        target: skills.id,
        set: skill,
      }).run();
    }

    for (const question of phase1Questions) {
      const values = {
        id: question.id,
        skillId: question.skillId,
        domain: question.domain,
        contentTier: "core" as const,
        structureTag: "phase1-e2e",
        estimatedSeconds: 60,
        readingLoad: "short" as const,
        answerMode: "written" as const,
        variantSpec: "{}",
        hintLadder: "[]",
        stem: question.stem,
        answerSpec: JSON.stringify(answerSpecSchema.parse(question.answerSpec)),
        explanation: question.explanation,
        difficulty: question.difficulty,
        active: true,
      };
      db.insert(questionTemplates).values(values).onConflictDoUpdate({
        target: questionTemplates.id,
        set: values,
      }).run();
    }
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
