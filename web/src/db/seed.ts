import path from "node:path";
import { pathToFileURL } from "node:url";
import { phase1DailySkills, phase1DailyTemplates } from "@/content/phase1-daily";
import { phase2Catalog, phase2Skills } from "@/content/phase2-catalog";
import { credentialInputSchema, hashCredential } from "@/domain/auth/credentials";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { instantiateTemplate } from "@/domain/questions/instantiate-template";
import { validateCatalog, type ReviewedTemplate } from "@/domain/questions/template-schema";
import { getDatabase, type AppDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { questionTemplates, skills, users } from "./schema";

type SeedDatabaseOptions = {
  catalog?: readonly unknown[];
  parentPassword?: string;
  childPin?: string;
  openDatabase?: () => AppDatabase;
};

export function requireReviewedCatalog(catalog: readonly unknown[]): ReviewedTemplate[] {
  const errors = validateCatalog(catalog);
  if (errors.length > 0) {
    throw new Error(`Catalog validation failed:\n${errors.join("\n")}`);
  }

  const knownSkills = new Set(phase2Skills.map(({ code }) => code));
  const missingSkills = (catalog as ReviewedTemplate[])
    .filter(({ skillCode }) => !knownSkills.has(skillCode))
    .map(({ id, skillCode }) => `${id}:${skillCode}`);
  if (missingSkills.length > 0) {
    throw new Error(`Catalog validation failed: unknown skills ${missingSkills.join(", ")}`);
  }

  return catalog as ReviewedTemplate[];
}

export async function seedDatabase(options: SeedDatabaseOptions = {}) {
  const catalog = requireReviewedCatalog(options.catalog ?? phase2Catalog);
  const parentPassword = options.parentPassword ?? process.env.PARENT_PASSWORD;
  const childPin = options.childPin ?? process.env.CHILD_PIN;

  if (!parentPassword || !childPin) {
    throw new Error("PARENT_PASSWORD and CHILD_PIN must both be set");
  }
  if (
    !credentialInputSchema.safeParse(parentPassword).success
    || !credentialInputSchema.safeParse(childPin).success
  ) {
    throw new Error("PARENT_PASSWORD and CHILD_PIN must each be 4-128 characters");
  }

  const [parentCredentialHash, childCredentialHash] = await Promise.all([
    hashCredential(parentPassword),
    hashCredential(childPin),
  ]);
  const db = (options.openDatabase ?? getDatabase)();
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

  for (const skill of [...phase2Skills, ...phase1DailySkills]) {
    await db.insert(skills).values(skill).onConflictDoUpdate({
      target: skills.id,
      set: {
        code: skill.code,
        name: skill.name,
        domain: skill.domain,
      },
    });
  }

  for (const template of phase1DailyTemplates) {
    const values = {
      id: template.id,
      skillId: template.skillId,
      domain: template.domain,
      contentTier: template.contentTier,
      structureTag: template.structureTag,
      estimatedSeconds: template.estimatedSeconds,
      readingLoad: template.readingLoad,
      answerMode: template.answerMode,
      variantSpec: "{}",
      hintLadder: "[]",
      commonErrors: JSON.stringify(template.commonErrors),
      readingCard: template.readingCard,
      source: template.source,
      licenseStatus: template.licenseStatus,
      stem: template.stem,
      answerSpec: JSON.stringify(answerSpecSchema.parse(template.answerSpec)),
      explanation: template.explanation,
      difficulty: template.difficulty,
      active: true,
    };
    await db.insert(questionTemplates).values(values).onConflictDoUpdate({
      target: questionTemplates.id,
      set: values,
    });
  }

  for (const template of catalog) {
    const instance = instantiateTemplate(template, `seed:${template.id}`);
    const values = {
      id: template.id,
      skillId: `skill-${template.skillCode}`,
      domain: template.domain,
      contentTier: template.contentTier,
      structureTag: template.structureTag,
      estimatedSeconds: template.estimatedSeconds,
      readingLoad: template.readingLoad,
      answerMode: template.answerMode,
      variantSpec: JSON.stringify(template.variantSpec),
      hintLadder: JSON.stringify(template.hintLadder),
      commonErrors: JSON.stringify(template.commonErrors),
      readingCard: template.readingCard,
      source: template.source,
      licenseStatus: template.licenseStatus,
      stem: instance.stem,
      answerSpec: JSON.stringify(instance.answerSpec),
      explanation: instance.explanation,
      difficulty: template.difficulty,
      active: true,
    };
    await db.insert(questionTemplates).values(values).onConflictDoUpdate({
      target: questionTemplates.id,
      set: values,
    });
  }
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url;
}

if (isDirectExecution()) {
  seedDatabase().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    process.stderr.write(`Database seed failed: ${message}\n`);
    process.exitCode = 1;
  });
}
