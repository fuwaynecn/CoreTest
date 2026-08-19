import path from "node:path";
import { credentialInputSchema, hashCredential } from "@/domain/auth/credentials";
import { answerSpecSchema } from "@/domain/questions/answer-spec";
import { getDatabase } from "./client";
import { migrateDatabase } from "./migrate";
import { questionTemplates, skills, users } from "./schema";

const seedQuestions = [
  { id: "q-decimal-1", skillId: "skill-decimal", stem: "3.6 + 2.4 = ?", answerSpec: { kind: "number", value: 6, tolerance: 0, unit: null }, explanation: "把十分位对齐相加，结果是 6。", difficulty: 1 },
  { id: "q-equation-1", skillId: "skill-equation", stem: "3x + 5 = 26，x 等于多少？", answerSpec: { kind: "number", value: 7, tolerance: 0, unit: null }, explanation: "先从等式两边都减去 5，再把两边都除以 3。", difficulty: 2 },
  { id: "q-reading-1", skillId: "skill-reading", stem: "每盒彩笔 7.5 元，买 1 盒需要付多少钱？请写单位。", answerSpec: { kind: "number", value: 7.5, tolerance: 0, unit: "元" }, explanation: "问题问付多少钱，因此答案必须带单位‘元’。", difficulty: 1 },
] as const;

async function seed() {
  const parentPassword = process.env.PARENT_PASSWORD;
  const childPin = process.env.CHILD_PIN;

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

  for (const skill of [
    { id: "skill-decimal", code: "decimal", name: "小数计算", domain: "数与运算" },
    { id: "skill-equation", code: "equation", name: "一步方程", domain: "方程与代数意识" },
    { id: "skill-reading", code: "reading", name: "读题与单位", domain: "数学思维与学习习惯" },
  ]) {
    await db.insert(skills).values(skill).onConflictDoUpdate({
      target: skills.id,
      set: {
        code: skill.code,
        name: skill.name,
        domain: skill.domain,
      },
    });
  }

  for (const question of seedQuestions) {
    const answerSpec = answerSpecSchema.parse(question.answerSpec);
    await db.insert(questionTemplates).values({
      id: question.id,
      skillId: question.skillId,
      stem: question.stem,
      answerSpec: JSON.stringify(answerSpec),
      explanation: question.explanation,
      difficulty: question.difficulty,
      active: true,
    }).onConflictDoUpdate({
      target: questionTemplates.id,
      set: {
        skillId: question.skillId,
        stem: question.stem,
        answerSpec: JSON.stringify(answerSpec),
        explanation: question.explanation,
        difficulty: question.difficulty,
        active: true,
      },
    });
  }
}

seed().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  process.stderr.write(`Database seed failed: ${message}\n`);
  process.exitCode = 1;
});
