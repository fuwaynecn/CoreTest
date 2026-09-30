import { childSkillSettings, skills, users } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { listChildSkillScope } from "./skill-scope";

const NOW = new Date("2026-09-29T00:00:00Z");

function seedSkills(db: ReturnType<typeof createTestDatabase>) {
  db.insert(skills).values([
    { id: "skill-low", code: "low", name: "低年级技能", domain: "number_operations", grade: 4, semester: 2, expectedWeek: 20 },
    { id: "skill-same-open", code: "same-open", name: "同级已开", domain: "number_operations", grade: 6, semester: 1, expectedWeek: 3 },
    { id: "skill-same-locked", code: "same-locked", name: "同级未开", domain: "number_operations", grade: 6, semester: 1, expectedWeek: 9 },
    { id: "skill-high", code: "high", name: "高年级技能", domain: "number_operations", grade: 6, semester: 1, expectedWeek: 1 },
  ]).run();
}

function seedChild(db: ReturnType<typeof createTestDatabase>, id: string, grade = 6) {
  db.insert(users).values({ id, role: "child", displayName: id, credentialHash: "h", createdAt: 1, grade }).run();
}

const child = { id: "c1", grade: 6, edition: "pep" as const };

test("1. 合成自动状态：低年级恒开、同级已开解锁、同级未开锁定", () => {
  const db = createTestDatabase();
  seedSkills(db);

  const rows = listChildSkillScope(db, child, NOW);
  const byCode = Object.fromEntries(rows.map((row) => [row.code, row]));

  expect(byCode.low.autoAvailable).toBe(true);
  expect(byCode.low.mode).toBe("auto");
  expect(byCode.low.enabled).toBe(true);

  expect(byCode["same-open"].autoAvailable).toBe(true);
  expect(byCode["same-open"].mode).toBe("auto");
  expect(byCode["same-open"].enabled).toBe(true);

  expect(byCode["same-locked"].autoAvailable).toBe(false);
  expect(byCode["same-locked"].mode).toBe("auto");
  expect(byCode["same-locked"].enabled).toBe(false);
});

test("2. 覆盖生效：on 覆盖同级未开 → enabled true，autoAvailable 仍为 false", () => {
  const db = createTestDatabase();
  seedSkills(db);
  seedChild(db, "c1");
  db.insert(childSkillSettings).values({ childId: "c1", skillId: "skill-same-locked", mode: "on", updatedAt: 1 }).run();

  const rows = listChildSkillScope(db, child, NOW);
  const sameLocked = rows.find((r) => r.code === "same-locked")!;

  expect(sameLocked.mode).toBe("on");
  expect(sameLocked.autoAvailable).toBe(false);
  expect(sameLocked.enabled).toBe(true);
});

test("3. mode off：覆盖关闭低年级技能 → enabled false，auto true", () => {
  const db = createTestDatabase();
  seedSkills(db);
  seedChild(db, "c1");
  db.insert(childSkillSettings).values({ childId: "c1", skillId: "skill-low", mode: "off", updatedAt: 1 }).run();

  const rows = listChildSkillScope(db, child, NOW);
  const low = rows.find((r) => r.code === "low")!;

  expect(low.mode).toBe("off");
  expect(low.autoAvailable).toBe(true);
  expect(low.enabled).toBe(false);
});

test("4. 无覆盖时所有行 mode 为 auto", () => {
  const db = createTestDatabase();
  seedSkills(db);

  const rows = listChildSkillScope(db, child, NOW);
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => r.mode === "auto")).toBe(true);
});

test("5. 只返回当前孩子的覆盖：其他孩子设置不影响", () => {
  const db = createTestDatabase();
  seedSkills(db);
  seedChild(db, "c2");
  db.insert(childSkillSettings).values([
    { childId: "c2", skillId: "skill-same-locked", mode: "on", updatedAt: 1 },
    { childId: "c2", skillId: "skill-low", mode: "off", updatedAt: 1 },
  ]).run();

  const rows = listChildSkillScope(db, child, NOW);
  expect(rows.every((r) => r.mode === "auto")).toBe(true);
});
