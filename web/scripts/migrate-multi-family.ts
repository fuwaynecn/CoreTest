import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { createDatabase } from "@/db/client";
import { migrateDatabase } from "@/db/migrate";
import { academicCalendar, skills, users } from "@/db/schema";
import { pepSkillSchedule } from "@/content/pep-skill-schedule";
import { DEFAULT_CALENDAR } from "@/domain/curriculum/skill-availability";

export type MultiFamilyMigrationOptions = {
  childLoginName: string;
  childGrade: number;
};

const LOGIN_NAME_REGEX = /^[a-z][a-z0-9_.]{1,31}$/;

function validateOptions(options: MultiFamilyMigrationOptions) {
  if (!LOGIN_NAME_REGEX.test(options.childLoginName)) {
    throw new Error("孩子登录名格式无效：必须以小写字母开头，2-32 位小写字母/数字/下划线/点");
  }
  if (!Number.isInteger(options.childGrade) || options.childGrade < 1 || options.childGrade > 6) {
    throw new Error("孩子年级无效：必须为 1-6 的整数");
  }
}

export function migrateToMultiFamily(
  db: AppDatabase,
  options: MultiFamilyMigrationOptions,
): void {
  validateOptions(options);

  db.transaction((tx) => {
    // 预检查：家长存在
    const parent = tx.select().from(users).where(eq(users.id, "parent")).get();
    if (!parent) {
      throw new Error("找不到现有家长账号（id=parent）");
    }
    if (parent.isAdmin) {
      throw new Error("数据已经升级过，无需重复运行");
    }

    // 预检查：登录名冲突 —— 孩子登录名
    const childLoginConflict = tx.select({ id: users.id })
      .from(users)
      .where(eq(users.loginName, options.childLoginName))
      .get();
    if (childLoginConflict && childLoginConflict.id !== "child") {
      throw new Error(`登录名已被使用：${options.childLoginName}`);
    }

    // 预检查：admin 登录名冲突
    const adminLoginConflict = tx.select({ id: users.id })
      .from(users)
      .where(eq(users.loginName, "admin"))
      .get();
    if (adminLoginConflict && adminLoginConflict.id !== "parent") {
      throw new Error("登录名已被使用：admin");
    }

    // 更新家长
    tx.update(users)
      .set({ loginName: "admin", isAdmin: true })
      .where(eq(users.id, "parent"))
      .run();

    // 更新孩子
    tx.update(users)
      .set({
        loginName: options.childLoginName,
        parentId: "parent",
        grade: options.childGrade,
        edition: "pep",
      })
      .where(eq(users.id, "child"))
      .run();

    // 更新技能：按 pepSkillSchedule 填充 grade/semester/expectedWeek
    const allSkills = tx.select().from(skills).all();
    for (const skill of allSkills) {
      const schedule = pepSkillSchedule[skill.code];
      if (!schedule) {
        throw new Error(`技能 ${skill.code} 在 pepSkillSchedule 中未找到`);
      }
      tx.update(skills)
        .set({
          grade: schedule.grade,
          semester: schedule.semester,
          expectedWeek: schedule.expectedWeek,
        })
        .where(eq(skills.id, skill.id))
        .run();
    }

    // 插入默认校历
    tx.insert(academicCalendar).values({
      ...DEFAULT_CALENDAR,
      updatedAt: Date.now(),
    }).onConflictDoNothing().run();
  });
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  return entryPoint !== undefined && pathToFileURL(path.resolve(entryPoint)).href === import.meta.url;
}

if (isDirectExecution()) {
  (() => {
    try {
      const { values } = parseArgs({
        options: {
          "child-login-name": { type: "string" },
          "child-grade": { type: "string", default: "6" },
        },
        strict: true,
        allowPositionals: false,
      });

      const childLoginName = values["child-login-name"];
      const childGradeStr = values["child-grade"];

      if (!childLoginName) {
        process.stderr.write("用法: node scripts/migrate-multi-family.ts --child-login-name=<name> [--child-grade=6]\n");
        process.exitCode = 1;
        return;
      }

      const childGrade = Number(childGradeStr);

      const dbPath = process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite";
      const db = createDatabase(dbPath);
      try {
        migrateDatabase(db, path.resolve(process.cwd(), "drizzle"));
        migrateToMultiFamily(db, { childLoginName, childGrade });
        process.stdout.write(`多家庭结构升级完成：孩子登录名 ${childLoginName}，年级 ${childGrade}\n`);
      } finally {
        db.$client.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      process.stderr.write(`错误：${message}\n`);
      process.exitCode = 1;
    }
  })();
}
