import { eq } from "drizzle-orm";
import { createTestDatabase } from "@/test/test-db";
import { academicCalendar, skills, users } from "@/db/schema";
import { pepSkillSchedule } from "@/content/pep-skill-schedule";
import { DEFAULT_CALENDAR } from "@/domain/curriculum/skill-availability";
import { migrateToMultiFamily } from "./migrate-multi-family";

function insertLegacyFixtures(db: ReturnType<typeof createTestDatabase>) {
  db.insert(users).values({
    id: "parent",
    role: "parent",
    displayName: "家长",
    credentialHash: "scrypt:legacy-hash",
    createdAt: Date.now(),
    loginName: null,
    isAdmin: false,
  }).run();

  db.insert(users).values({
    id: "child",
    role: "child",
    displayName: "孩子",
    credentialHash: "scrypt:legacy-child-hash",
    createdAt: Date.now(),
    loginName: null,
    parentId: null,
    grade: null,
    isAdmin: false,
  }).run();

  // Legacy skills with default grade=1/semester=1/expectedWeek=1
  db.insert(skills).values([
    { id: "skill-decimal", code: "decimal", name: "小数计算", domain: "number_operations" },
    { id: "skill-reading", code: "reading", name: "阅读理解", domain: "thinking_habits" },
  ]).run();
}

describe("migrateToMultiFamily", () => {
  it("完整迁移：家长升级为管理员、孩子绑定登录名与年级、技能按 pep 进度、插入默认校历", () => {
    const db = createTestDatabase();
    insertLegacyFixtures(db);

    migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 });

    // 家长
    const parentRow = db.select().from(users).where(eq(users.id, "parent")).get()!;
    expect(parentRow.loginName).toBe("admin");
    expect(parentRow.isAdmin).toBe(true);

    // 孩子
    const childRow = db.select().from(users).where(eq(users.id, "child")).get()!;
    expect(childRow.loginName).toBe("mykid");
    expect(childRow.parentId).toBe("parent");
    expect(childRow.grade).toBe(6);
    expect(childRow.edition).toBe("pep");

    // 技能：按 pepSkillSchedule 更新
    const allSkills = db.select().from(skills).all();
    for (const skill of allSkills) {
      const expected = pepSkillSchedule[skill.code];
      expect(expected, `skill ${skill.code} 应在 pepSkillSchedule 中`).toBeDefined();
      expect(skill.grade).toBe(expected.grade);
      expect(skill.semester).toBe(expected.semester);
      expect(skill.expectedWeek).toBe(expected.expectedWeek);
    }
    // 明确 decimal 不应保持默认值 1
    const decimalSkill = allSkills.find((s) => s.code === "decimal");
    expect(decimalSkill!.grade).toBe(4);

    // 校历：恰好一条默认记录
    const calendarRows = db.select().from(academicCalendar).all();
    expect(calendarRows).toHaveLength(1);
    expect(calendarRows[0]).toMatchObject({
      schoolYear: DEFAULT_CALENDAR.schoolYear,
      semester1Start: DEFAULT_CALENDAR.semester1Start,
      semester2Start: DEFAULT_CALENDAR.semester2Start,
    });
  });

  it("已迁移时重复调用抛错且不改动数据", () => {
    const db = createTestDatabase();
    insertLegacyFixtures(db);

    migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 });
    const calendarCountBefore = db.select().from(academicCalendar).all().length;

    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 }))
      .toThrow(/^数据已经升级过/);

    // 不重复插入校历
    const calendarCountAfter = db.select().from(academicCalendar).all().length;
    expect(calendarCountAfter).toBe(calendarCountBefore);

    // 家长状态不变
    const parentRow = db.select().from(users).where(eq(users.id, "parent")).get()!;
    expect(parentRow.isAdmin).toBe(true);
    expect(parentRow.loginName).toBe("admin");
  });

  it("缺少 id=parent 的家长记录时抛错", () => {
    const db = createTestDatabase();
    // 不插入任何用户
    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 }))
      .toThrow(/id=parent/);
  });

  it("登录名冲突时提前抛错且不产生部分变更", () => {
    const db = createTestDatabase();
    insertLegacyFixtures(db);

    // 插入另一个已占用 mykid 登录名的用户
    db.insert(users).values({
      id: "other-user",
      role: "parent",
      displayName: "其他用户",
      credentialHash: "scrypt:other-hash",
      createdAt: Date.now(),
      loginName: "mykid",
      isAdmin: false,
    }).run();

    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 }))
      .toThrow("登录名已被使用：mykid");

    // 没有部分变更：家长仍非管理员
    const parentRow = db.select().from(users).where(eq(users.id, "parent")).get()!;
    expect(parentRow.isAdmin).toBe(false);
    expect(parentRow.loginName).toBeNull();
  });

  it("admin 登录名被占用时抛错", () => {
    const db = createTestDatabase();
    insertLegacyFixtures(db);

    // 另一个用户占用了 'admin' 登录名
    db.insert(users).values({
      id: "intruder",
      role: "parent",
      displayName: "闯入者",
      credentialHash: "scrypt:intruder-hash",
      createdAt: Date.now(),
      loginName: "admin",
      isAdmin: false,
    }).run();

    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 }))
      .toThrow("登录名已被使用：admin");

    const parentRow = db.select().from(users).where(eq(users.id, "parent")).get()!;
    expect(parentRow.isAdmin).toBe(false);
  });

  it("无效的 childLoginName 格式抛错", () => {
    const db = createTestDatabase();
    insertLegacyFixtures(db);

    expect(() => migrateToMultiFamily(db, { childLoginName: "123bad", childGrade: 6 }))
      .toThrow();
    expect(() => migrateToMultiFamily(db, { childLoginName: "", childGrade: 6 }))
      .toThrow();
  });

  it("无效的 childGrade 抛错", () => {
    const db = createTestDatabase();
    insertLegacyFixtures(db);

    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 0 }))
      .toThrow();
    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 7 }))
      .toThrow();
    expect(() => migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 3.5 }))
      .toThrow();
  });
});
