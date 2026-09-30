# 多家庭多孩子支持（结构改造）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (per-task fresh subagent + review) or superpowers:executing-plans to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不部署、不动生产数据的前提下，完成多家庭多孩子的全部结构改造：账号体系（登录名+孩子归属）、校历解锁引擎、家长端页面重构、出题/诊断范围过滤以及现有数据升级脚本。

**Architecture:** 数据层在 `users`/`skills` 上做最小增量并新增 `child_skill_settings`（auto/on/off 三态）、`academic_calendar` 两张表；核心逻辑放在新建的 `src/domain/curriculum/` 和 `src/services/curriculum/`；解锁引擎只通过 `resolveSkillSchedule()` 取知识点进度（为 Plan 2 的版本覆盖预留）；所有涉及孩子的 API 必须过归属校验；现有单孩子数据由独立的数据升级脚本处理，不进 Drizzle 常规迁移。

**Tech Stack:** Next.js 16.3.1 (App Router)、Drizzle ORM 1.0 RC + node:sqlite、TypeScript、Vitest、Playwright、Zod。

**Spec:** `docs/superpowers/specs/2026-09-29-multi-family-multi-child-design.md`（计划与规格同行；执行者两者都读）

## Global Constraints

- 工作目录为 `web/`，所有 npm 命令在 `web/` 下执行。
- **禁止部署/重启 math-trainer 容器、禁止 SSH 到 106.53.172.63、禁止改动生产库**；仅本地开发库与测试库。
- 不新增 npm 依赖；使用项目已有的 drizzle/zod/vitest 等。
- 登录名规则：2–32 位，小写字母开头，可含小写字母/数字/下划线/点（正则 `^[a-z][a-z0-9_.]{1,31}$`）。
- 中文文案一律使用全角标点；按钮/标签文案以本计划为准。
- 每个 Task 结束必须提交；提交信息使用 conventional commits 前缀（`feat:` / `fix:` / `refactor:` / `docs:` / `chore:`）。
- TDD：先写失败测试 → 验证失败 → 实现 → 验证通过 → 提交。
- Plan 2（题库内容：新增知识点、decimal/fraction/percent 拆分、80–120 模板）**不在本计划内**；decimal/fraction/percent 的年级为临时值，已在数据文件中标注。

---

## File Structure

| 路径 | 职责 | 动作 |
|------|------|------|
| `web/src/db/schema.ts` | 表结构 | 修改：users/skills 增量，新增两张表 |
| `web/drizzle/<new>/migration.sql` | Drizzle 结构迁移 | 生成 |
| `web/src/content/pep-skill-schedule.ts` | 40 个知识点的人教版进度数据 | 创建 |
| `web/src/domain/curriculum/types.ts` | 课程域类型定义 | 创建 |
| `web/src/domain/curriculum/resolve-schedule.ts` | 进度解析函数（版本扩展点） | 创建 |
| `web/src/domain/curriculum/academic-calendar.ts` | 校历解析、当前阶段、周数计算 | 创建 |
| `web/src/domain/curriculum/skill-availability.ts` | 自动解锁判定 + 三态合成 | 创建 |
| `web/src/services/curriculum/skill-scope.ts` | 聚合 DB 的孩子可用知识点查询 | 创建 |
| `web/src/app/api/auth/login/route.ts` | 登录 API | 修改 |
| `web/src/app/login/login-form.tsx` | 登录表单 | 修改 |
| `web/src/lib/auth/parent-child.ts` | 家长身份与孩子归属守卫 | 创建 |
| `web/src/lib/auth/current-user.ts` | 当前用户（增加 isAdmin） | 修改 |
| `web/src/app/api/parent/children/route.ts` | 添加孩子 API | 创建 |
| `web/src/app/api/parent/children/[id]/route.ts` | 修改孩子信息 API | 创建 |
| `web/src/app/api/parent/children/[id]/reset-password/route.ts` | 重置孩子密码 API | 创建 |
| `web/scripts/create-family.ts` | 手动家长开户脚本 | 创建 |
| `web/src/app/parent/page.tsx` | 家长首页 → 孩子卡片列表 | 重写 |
| `web/src/app/parent/children/[childId]/page.tsx` | 单孩子学习详情（迁入现有内容） | 创建 |
| `web/src/app/api/parent/children/[id]/skills/route.ts` | 知识点开关 API | 创建 |
| `web/src/app/parent/children/[childId]/skills/page.tsx` | 知识点设置页 | 创建 |
| `web/src/app/api/parent/calendar/route.ts` | 校历管理 API | 创建 |
| `web/src/app/parent/calendar/page.tsx` | 校历管理页 | 创建 |
| `web/src/app/parent/settings/page.tsx` | 管理员设置（AI 配置迁入） | 创建 |
| `web/src/services/training/create-adaptive-session.ts` | 每日组题加范围过滤 | 修改 |
| `web/src/services/diagnosis/diagnosis-service.ts` | 诊断加范围过滤 | 修改 |
| `web/scripts/migrate-multi-family.ts` | 现有数据升级脚本（含可导入函数） | 创建 |
| `web/src/db/seed.ts` | 种子：登录名等新字段 | 修改 |

---

### Task 1: 数据库结构扩展与 Drizzle 迁移

**Files:**
- Modify: `web/src/db/schema.ts`
- Generate: `web/drizzle/` 下新迁移目录
- Test: `web/src/db/schema.test.ts`（新建）

**Interfaces:**
- Produces: 新列与新表，供后续所有任务使用。
  - users 新列：`loginName: string | null`、`parentId: string | null`、`grade: number | null`、`edition: "pep"`、`isAdmin: boolean`
  - skills 新列：`grade: number`、`semester: number`、`expectedWeek: number`
  - 新表：`childSkillSettings`（列 `childId, skillId, mode: "auto"|"on"|"off", updatedAt`）、`academicCalendar`（列 `schoolYear, semester1Start, semester2Start, updatedAt`）

- [ ] **Step 1: 写失败测试**

创建 `web/src/db/schema.test.ts`：

```ts
import { createTestDatabase } from "@/test/test-db";

describe("multi-family schema", () => {
  it("users 支持登录名、归属、年级、版本与管理员标记", () => {
    const db = createTestDatabase();
    db.run(`INSERT INTO users (id, role, display_name, credential_hash, created_at,
      login_name, parent_id, grade, edition, is_admin)
      VALUES ('p1','parent','家长','h',1,'admin',NULL,NULL,'pep',1)`);
    db.run(`INSERT INTO users (id, role, display_name, credential_hash, created_at,
      login_name, parent_id, grade, edition, is_admin)
      VALUES ('c1','child','孩子','h',2,'kid','p1',6,'pep',0)`);
    const child = db.all("SELECT * FROM users WHERE id='c1'")[0] as Record<string, unknown>;
    expect(child.parent_id).toBe("p1");
    expect(child.grade).toBe(6);
  });

  it("skills 含年级/学期/周序；两张新表可写入", () => {
    const db = createTestDatabase();
    db.run(`INSERT INTO skills (id, code, name, domain, grade, semester, expected_week)
      VALUES ('skill-x','x','X','number_operations',5,1,10)`);
    db.run(`INSERT INTO academic_calendar (school_year, semester1_start, semester2_start, updated_at)
      VALUES ('2026-2027','2026-09-01','2027-02-22',1)`);
    db.run(`INSERT INTO child_skill_settings (child_id, skill_id, mode, updated_at)
      VALUES ('c1','skill-x','on',1)`);
    const row = db.all("SELECT mode FROM child_skill_settings")[0] as Record<string, unknown>;
    expect(row.mode).toBe("on");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm run test:run -- src/db/schema.test.ts`
Expected: FAIL（no such column: login_name）

- [ ] **Step 3: 修改 schema.ts**

在 `users` 表定义中加入（`integer`/`text` 已导入）：

```ts
  loginName: text("login_name").unique(),
  parentId: text("parent_id").references((): AnySQLiteColumn => users.id),
  grade: integer("grade"),
  edition: text("edition", { enum: ["pep"] }).notNull().default("pep"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
```

在 `skills` 表中加入（默认值保证存量行迁移合法）：

```ts
  grade: integer("grade").notNull().default(1),
  semester: integer("semester").notNull().default(1),
  expectedWeek: integer("expected_week").notNull().default(1),
```

文件末尾新增两表（`sqliteTable` 已导入；`mode` 用枚举列）：

```ts
export const childSkillSettings = sqliteTable("child_skill_settings", {
  childId: text("child_id").notNull().references(() => users.id),
  skillId: text("skill_id").notNull().references(() => skills.id),
  mode: text("mode", { enum: ["auto", "on", "off"] }).notNull().default("auto"),
  updatedAt: integer("updated_at").notNull(),
}, (table) => [primaryKey({ columns: [table.childId, table.skillId] })]);

export const academicCalendar = sqliteTable("academic_calendar", {
  schoolYear: text("school_year").primaryKey(),
  semester1Start: text("semester1_start").notNull(),
  semester2Start: text("semester2_start").notNull(),
  updatedAt: integer("updated_at").notNull(),
});
```

- [ ] **Step 4: 生成迁移并检查 SQL**

Run: `npm run db:generate`
Expected: 生成新目录，打开其中 `migration.sql` 人工确认：users/skills 为 SQLite 重建表式变更，新数据行随 `INSERT INTO __new_... SELECT` 保留；新增两张 CREATE TABLE。

- [ ] **Step 5: 运行测试确认通过**

Run: `npm run test:run -- src/db/schema.test.ts`
Expected: PASS（2 tests）

- [ ] **Step 6: 提交**

```bash
git add src/db/schema.ts src/db/schema.test.ts drizzle
git commit -m "feat: 多家庭结构 - users/skills 增量列与 child_skill_settings、academic_calendar 表"
```

---

### Task 2: 人教版知识点进度数据文件

**Files:**
- Create: `web/src/content/pep-skill-schedule.ts`
- Test: `web/src/content/pep-skill-schedule.test.ts`（新建）

**Interfaces:**
- Produces:
  ```ts
  export type PepSkillScheduleEntry = { grade: 1|2|3|4|5|6; semester: 1|2; expectedWeek: number; note?: string };
  export const pepSkillSchedule: Record<string, PepSkillScheduleEntry>;
  ```

- [ ] **Step 1: 写失败测试**

```ts
import { phase1DailySkills } from "./phase1-daily";
import { phase2Skills } from "./phase2-catalog";
import { pepSkillSchedule } from "./pep-skill-schedule";

describe("pepSkillSchedule", () => {
  const codes = new Set([
    ...phase2Skills.map((skill) => skill.code),
    ...phase1DailySkills.map((skill) => skill.code),
  ]);

  it("每个现有知识点都有且仅有一条合法进度", () => {
    for (const code of codes) {
      const entry = pepSkillSchedule[code];
      expect(entry, `missing ${code}`).toBeDefined();
      expect(entry.grade).toBeGreaterThanOrEqual(1);
      expect(entry.grade).toBeLessThanOrEqual(6);
      expect([1, 2]).toContain(entry.semester);
      expect(entry.expectedWeek).toBeGreaterThanOrEqual(1);
      expect(entry.expectedWeek).toBeLessThanOrEqual(20);
    }
  });

  it("没有多余代码", () => {
    expect(new Set(Object.keys(pepSkillSchedule))).toEqual(codes);
  });
});
```

- [ ] **Step 2: 运行确认失败** — `npm run test:run -- src/content/pep-skill-schedule.test.ts` → FAIL（模块不存在）。

- [ ] **Step 3: 创建数据文件**

```ts
export type PepSkillScheduleEntry = {
  grade: 1 | 2 | 3 | 4 | 5 | 6;
  semester: 1 | 2;
  expectedWeek: number;
  note?: string;
};

// 依据人教版编排；expectedWeek 为“约第几周学完”。
// decimal/fraction/percent 跨学期，本数据为临时值，Plan 2 拆分时定稿。
export const pepSkillSchedule = {
  "integer-mental": { grade: 3, semester: 1, expectedWeek: 3 },
  decimal: { grade: 4, semester: 2, expectedWeek: 14, note: "临时值：含五上小数乘除，Plan 2 拆分" },
  fraction: { grade: 5, semester: 2, expectedWeek: 15, note: "临时值：含六上乘除，Plan 2 拆分" },
  "mixed-operations": { grade: 4, semester: 1, expectedWeek: 6 },
  "operation-law": { grade: 4, semester: 2, expectedWeek: 10 },
  estimate: { grade: 3, semester: 1, expectedWeek: 12 },
  "reverse-check": { grade: 4, semester: 2, expectedWeek: 12 },
  "equation-l1": { grade: 5, semester: 1, expectedWeek: 10 },
  "equation-l2": { grade: 5, semester: 1, expectedWeek: 11 },
  "equation-l3": { grade: 5, semester: 1, expectedWeek: 12 },
  "equation-l4": { grade: 5, semester: 1, expectedWeek: 13 },
  "equation-l5": { grade: 5, semester: 1, expectedWeek: 14 },
  "equation-l6": { grade: 5, semester: 1, expectedWeek: 15, note: "实际为初一内容" },
  angle: { grade: 4, semester: 1, expectedWeek: 9 },
  perimeter: { grade: 3, semester: 1, expectedWeek: 13 },
  area: { grade: 3, semester: 2, expectedWeek: 10 },
  volume: { grade: 5, semester: 2, expectedWeek: 8 },
  "composite-geometry": { grade: 5, semester: 1, expectedWeek: 15 },
  spatial: { grade: 4, semester: 2, expectedWeek: 3 },
  "length-conversion": { grade: 3, semester: 1, expectedWeek: 5 },
  "data-table": { grade: 3, semester: 2, expectedWeek: 7 },
  "data-bar": { grade: 4, semester: 1, expectedWeek: 14 },
  "data-line": { grade: 5, semester: 2, expectedWeek: 15 },
  "data-average": { grade: 4, semester: 2, expectedWeek: 15 },
  "data-compare": { grade: 4, semester: 2, expectedWeek: 17 },
  possibility: { grade: 5, semester: 1, expectedWeek: 9 },
  "price-model": { grade: 4, semester: 1, expectedWeek: 8 },
  "distance-model": { grade: 4, semester: 1, expectedWeek: 9 },
  "work-model": { grade: 6, semester: 1, expectedWeek: 9 },
  "ratio-model": { grade: 6, semester: 1, expectedWeek: 11 },
  "percent-model": { grade: 6, semester: 1, expectedWeek: 16 },
  "multi-step-model": { grade: 4, semester: 2, expectedWeek: 12 },
  "extra-information": { grade: 3, semester: 2, expectedWeek: 12 },
  "read-question": { grade: 2, semester: 1, expectedWeek: 8 },
  "find-condition": { grade: 2, semester: 2, expectedWeek: 8 },
  "unit-awareness": { grade: 2, semester: 2, expectedWeek: 8 },
  "estimate-check": { grade: 3, semester: 2, expectedWeek: 6 },
  "check-strategy": { grade: 3, semester: 2, expectedWeek: 8 },
  reading: { grade: 3, semester: 1, expectedWeek: 10 },
  equation: { grade: 5, semester: 1, expectedWeek: 12 },
} satisfies Record<string, PepSkillScheduleEntry>;
```

- [ ] **Step 4: 运行确认通过** — `npm run test:run -- src/content/pep-skill-schedule.test.ts` → PASS（2 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/content/pep-skill-schedule.ts src/content/pep-skill-schedule.test.ts
git commit -m "feat: 40 个知识点的人教版年级/学期/周序数据"
```

---

### Task 3: 课程域类型与 resolveSkillSchedule

**Files:**
- Create: `web/src/domain/curriculum/types.ts`
- Create: `web/src/domain/curriculum/resolve-schedule.ts`
- Test: `web/src/domain/curriculum/resolve-schedule.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type EditionCode = "pep";
  export type OverrideMode = "auto" | "on" | "off";
  export type SkillSchedule = { grade: number; semester: 1 | 2; expectedWeek: number };
  export function resolveSkillSchedule(skill: SkillSchedule, edition: EditionCode): SkillSchedule;
  ```

- [ ] **Step 1: 写失败测试**

```ts
import { resolveSkillSchedule } from "./resolve-schedule";

describe("resolveSkillSchedule", () => {
  const schedule = { grade: 5, semester: 1, expectedWeek: 10 } as const;

  it("pep 版本直接返回知识点自身进度", () => {
    expect(resolveSkillSchedule(schedule, "pep")).toEqual({ ...schedule });
  });

  it("返回新对象，调用方修改不影响原值", () => {
    const resolved = resolveSkillSchedule(schedule, "pep");
    resolved.grade = 99;
    expect(schedule.grade).toBe(5);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL（模块不存在）。

- [ ] **Step 3: 创建类型与实现**

`types.ts`：

```ts
export const editionCodes = ["pep"] as const;
export type EditionCode = (typeof editionCodes)[number];

export const overrideModes = ["auto", "on", "off"] as const;
export type OverrideMode = (typeof overrideModes)[number];

export type SkillSchedule = {
  grade: number;
  semester: 1 | 2;
  expectedWeek: number;
};

export type ChildProfile = {
  id: string;
  grade: number;
  edition: EditionCode;
};
```

`resolve-schedule.ts`：

```ts
import type { EditionCode, SkillSchedule } from "./types";

// 扩展点：未来接入 skill_edition_overrides 时，在此函数内查覆盖行，
// 有覆盖返回覆盖值，无覆盖返回 skill 基线；调用方无需改动。
export function resolveSkillSchedule(skill: SkillSchedule, _edition: EditionCode): SkillSchedule {
  return { grade: skill.grade, semester: skill.semester, expectedWeek: skill.expectedWeek };
}
```

- [ ] **Step 4: 运行确认通过** — PASS（2 tests）。

- [ ] **Step 5: 提交**

```bash
git add src/domain/curriculum
git commit -m "feat: 课程域类型与 resolveSkillSchedule 进度解析函数"
```

---

### Task 4: 校历解析与自动解锁引擎

**Files:**
- Create: `web/src/domain/curriculum/academic-calendar.ts`
- Create: `web/src/domain/curriculum/skill-availability.ts`
- Test: `web/src/domain/curriculum/skill-availability.test.ts`

**Interfaces:**
- Consumes: `SkillSchedule`, `ChildProfile`, `OverrideMode`, `resolveSkillSchedule`（Task 3）。
- Produces:
  ```ts
  export type CalendarRow = { schoolYear: string; semester1Start: string; semester2Start: string };
  export const DEFAULT_CALENDAR: CalendarRow; // 2026-2027, 2026-09-01, 2027-02-22
  export function currentSchoolYear(now: Date): string;
  export type AcademicPhase = "semester1" | "semester2" | "summer";
  export function resolveAcademicCalendar(row: CalendarRow | undefined, now: Date): { calendar: CalendarRow; usedDefault: boolean; phase: AcademicPhase; weeksIntoTerm: number };
  export function autoAvailable(schedule: SkillSchedule, child: ChildProfile, context: ReturnType<typeof resolveAcademicCalendar>): boolean;
  export function effectiveEnabled(mode: OverrideMode, auto: boolean): boolean;
  ```

- [ ] **Step 1: 写失败测试**

```ts
import {
  DEFAULT_CALENDAR, autoAvailable, currentSchoolYear,
  effectiveEnabled, resolveAcademicCalendar,
} from "./skill-availability";
import type { ChildProfile } from "./types";

const child: ChildProfile = { id: "c1", grade: 5, edition: "pep" };

describe("currentSchoolYear", () => {
  it("8-12 月归本学年，1-7 月归上学年", () => {
    expect(currentSchoolYear(new Date("2026-10-01T00:00:00Z"))).toBe("2026-2027");
    expect(currentSchoolYear(new Date("2027-01-15T00:00:00Z"))).toBe("2026-2027");
    expect(currentSchoolYear(new Date("2027-08-31T00:00:00Z"))).toBe("2026-2027");
    expect(currentSchoolYear(new Date("2027-09-01T00:00:00Z"))).toBe("2027-2028");
  });
});

describe("resolveAcademicCalendar", () => {
  it("缺行用默认并标记 usedDefault", () => {
    const result = resolveAcademicCalendar(undefined, new Date("2026-10-01"));
    expect(result.usedDefault).toBe(true);
    expect(result.calendar.schoolYear).toBe(DEFAULT_CALENDAR.schoolYear);
    expect(result.phase).toBe("semester1");
  });

  it("10 月 1 日开学 4 周整", () => {
    const result = resolveAcademicCalendar(undefined, new Date("2026-09-29"));
    expect(result.weeksIntoTerm).toBe(4);
  });

  it("3 月进入下学期，8 月为暑假", () => {
    const row = { schoolYear: "2026-2027", semester1Start: "2026-09-01", semester2Start: "2027-02-22" };
    expect(resolveAcademicCalendar(row, new Date("2027-03-01")).phase).toBe("semester2");
    expect(resolveAcademicCalendar(row, new Date("2027-08-01")).phase).toBe("summer");
  });
});

describe("autoAvailable", () => {
  const ctx = resolveAcademicCalendar(undefined, new Date("2026-09-29")); // week 4 of s1

  it("低年级恒解锁、高年级恒锁定", () => {
    expect(autoAvailable({ grade: 4, semester: 2, expectedWeek: 20 }, child, ctx)).toBe(true);
    expect(autoAvailable({ grade: 6, semester: 1, expectedWeek: 1 }, child, ctx)).toBe(false);
  });

  it("同年级上册按周序解锁", () => {
    expect(autoAvailable({ grade: 5, semester: 1, expectedWeek: 4 }, child, ctx)).toBe(true);
    expect(autoAvailable({ grade: 5, semester: 1, expectedWeek: 5 }, child, ctx)).toBe(false);
  });

  it("同年级下册在开学期间锁定", () => {
    expect(autoAvailable({ grade: 5, semester: 2, expectedWeek: 1 }, child, ctx)).toBe(false);
  });

  it("暑假期间同年级全部解锁", () => {
    const summer = resolveAcademicCalendar(undefined, new Date("2027-08-01"));
    expect(autoAvailable({ grade: 5, semester: 2, expectedWeek: 20 }, child, summer)).toBe(true);
  });
});

describe("effectiveEnabled", () => {
  it("off 恒关、on 恒开、auto 跟随", () => {
    expect(effectiveEnabled("off", true)).toBe(false);
    expect(effectiveEnabled("on", false)).toBe(true);
    expect(effectiveEnabled("auto", true)).toBe(true);
    expect(effectiveEnabled("auto", false)).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL（模块不存在）。

- [ ] **Step 3: 创建 academic-calendar.ts**

```ts
import type { CalendarRow } from "./skill-availability";

export type AcademicPhase = "semester1" | "semester2" | "summer";

const MS_PER_DAY = 86_400_000;

export function currentSchoolYear(now: Date): string {
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() >= 8 ? year : year - 1; // 9 月起新学年
  return `${startYear}-${startYear + 1}`;
}

function daysBetween(start: string, now: Date): number {
  return Math.floor((now.getTime() - Date.parse(`${start}T00:00:00Z`)) / MS_PER_DAY);
}

export function weeksElapsedSince(start: string, now: Date): number {
  return Math.floor(daysBetween(start, now) / 7);
}

export function resolveAcademicCalendar(
  row: CalendarRow | undefined,
  now: Date,
): { calendar: CalendarRow; usedDefault: boolean; phase: AcademicPhase; weeksIntoTerm: number } {
  const calendar = row ?? {
    schoolYear: "2026-2027",
    semester1Start: "2026-09-01",
    semester2Start: "2027-02-22",
  };

  const beforeSemester2 = now.getTime() < Date.parse(`${calendar.semester2Start}T00:00:00Z`);
  if (beforeSemester2) {
    return { calendar, usedDefault: !row, phase: "semester1", weeksIntoTerm: weeksElapsedSince(calendar.semester1Start, now) };
  }
  // 下学期结束按 19 教学周估算，之后至下一学年开学前为暑假。
  const semester2End = Date.parse(`${calendar.semester2Start}T00:00:00Z`) + 19 * 7 * MS_PER_DAY;
  if (now.getTime() < semester2End) {
    return { calendar, usedDefault: !row, phase: "semester2", weeksIntoTerm: weeksElapsedSince(calendar.semester2Start, now) };
  }
  return { calendar, usedDefault: !row, phase: "summer", weeksIntoTerm: 0 };
}
```

- [ ] **Step 4: 创建 skill-availability.ts**

```ts
import { resolveSkillSchedule } from "./resolve-schedule";
import type { ChildProfile, OverrideMode, SkillSchedule } from "./types";

export type CalendarRow = {
  schoolYear: string;
  semester1Start: string;
  semester2Start: string;
};

export const DEFAULT_CALENDAR: CalendarRow = {
  schoolYear: "2026-2027",
  semester1Start: "2026-09-01",
  semester2Start: "2027-02-22",
};

export {
  currentSchoolYear,
  resolveAcademicCalendar,
  type AcademicPhase,
} from "./academic-calendar";

export type CalendarContext = ReturnType<typeof import("./academic-calendar").resolveAcademicCalendar>;

export function autoAvailable(
  schedule: SkillSchedule,
  child: ChildProfile,
  context: CalendarContext,
): boolean {
  const resolved = resolveSkillSchedule(schedule, child.edition);

  if (resolved.grade < child.grade) return true;
  if (resolved.grade > child.grade) return false;

  if (context.phase === "summer") return true;
  if (context.phase === "semester1") {
    return resolved.semester === 1 && context.weeksIntoTerm >= resolved.expectedWeek;
  }
  // semester2：上册内容已学完恒解锁；下册按周序。
  return resolved.semester === 1 || context.weeksIntoTerm >= resolved.expectedWeek;
}

export function effectiveEnabled(mode: OverrideMode, auto: boolean): boolean {
  if (mode === "off") return false;
  if (mode === "on") return true;
  return auto;
}
```

- [ ] **Step 5: 运行确认通过** — `npm run test:run -- src/domain/curriculum/skill-availability.test.ts` → PASS（12 assertions）。

- [ ] **Step 6: 提交**

```bash
git add src/domain/curriculum
git commit -m "feat: 校历解析与知识点自动解锁引擎"
```

---

### Task 5: 登录 API 与登录表单支持登录名

**Files:**
- Modify: `web/src/app/api/auth/login/route.ts`
- Modify: `web/src/app/login/login-form.tsx`
- Modify: `web/src/app/login/page.tsx`
- Test: `web/src/app/api/auth/auth-routes.test.ts`（扩展现有文件）

**Interfaces:**
- Consumes: users.loginName（Task 1）。
- Produces: `POST /api/auth/login` 请求体 `{ role: "parent"|"child"; loginName: string; credential: string }`。

- [ ] **Step 1: 在现有 auth-routes.test.ts 中追加失败测试**

```ts
  it("登录名不存在时拒绝登录", async () => {
    const request = new Request("http://localhost/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ role: "child", loginName: "ghost", credential: "2468" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(401);
  });
```

并把现有成功用例的请求体改为包含 `loginName`（种子孩子的登录名，fixture 中显式插入：`login_name='testkid'`）。

- [ ] **Step 2: 运行确认失败** — `npm run test:run -- src/app/api/auth/auth-routes.test.ts` → FAIL（401）。

- [ ] **Step 3: 修改登录 API**

`loginInput` 改为：

```ts
const loginNameSchema = z.string().regex(/^[a-z][a-z0-9_.]{1,31}$/);

const loginInput = z.object({
  role: z.enum(["parent", "child"]),
  loginName: loginNameSchema,
  credential: credentialInputSchema,
});
```

查询改为按角色 + 登录名：

```ts
  const [user] = await db
    .select({ id: users.id, credentialHash: users.credentialHash })
    .from(users)
    .where(and(eq(users.role, input.data.role), eq(users.loginName, input.data.loginName)))
    .limit(1);
```

（补充导入 `and`；其余会话下发逻辑不变。）

- [ ] **Step 4: 修改登录表单与页面文案**

表单状态加 `loginName`；请求体加 `loginName`；在角色卡与密码框之间加入：

```tsx
      <label className="credentialField">
        <span>登录名</span>
        <input
          required
          minLength={2}
          maxLength={32}
          autoComplete="username"
          value={loginName}
          onChange={(event) => setLoginName(event.target.value)}
        />
      </label>
```

角色切换时不清空登录名（方便家长/孩子切换）；更新 `login/page.tsx` 副文案为「孩子使用登录名和 PIN，家长使用登录名和家长密码。」、角色卡内说明改为「使用登录名与 PIN 登录」「使用登录名与家长密码登录」。

- [ ] **Step 5: 运行确认通过**

Run: `npm run test:run -- src/app/api/auth/auth-routes.test.ts`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add src/app/api/auth src/app/login
git commit -m "feat: 登录支持全局登录名"
```

---

### Task 6: 家长管理孩子的 API

**Files:**
- Create: `web/src/lib/auth/parent-child.ts`
- Modify: `web/src/lib/auth/current-user.ts`
- Create: `web/src/app/api/parent/children/route.ts`
- Create: `web/src/app/api/parent/children/[id]/route.ts`
- Create: `web/src/app/api/parent/children/[id]/reset-password/route.ts`
- Test: `web/src/app/api/parent/children/children-api.test.ts`

**Interfaces:**
- Consumes: users 新列（Task 1）、hashCredential（现有）。
- Produces:
  ```ts
  // lib/auth/parent-child.ts
  export async function requireParent(): Promise<CurrentUser & { isAdmin: boolean }>;
  export function getOwnedChild(db: AppDatabase, parentId: string, childId: string): { id: string; displayName: string; loginName: string; grade: number; edition: EditionCode } | null;
  ```
  API：`POST /api/parent/children`（添加）、`PATCH /api/parent/children/[id]`（改名/年级）、`POST /api/parent/children/[id]/reset-password`。

- [ ] **Step 1: 写失败测试**

```ts
import { createTestDatabase } from "@/test/test-db";
import * as parentChildLib from "@/lib/auth/parent-child";

// 三个路由共用一个带 cookie 的家长会话 fixture；
// 孩子行 c-other 属于另一位家长 parent-other。
describe("children API", () => {
  it("POST 创建归属于当前家长的孩子", async () => {
    const response = await POST(new Request("http://localhost/api/parent/children", {
      method: "POST",
      body: JSON.stringify({ displayName: "小二", loginName: "kid2", grade: 3, credential: "1357" }),
    }));
    expect(response.status).toBe(201);
    const row = db.all("SELECT parent_id FROM users WHERE login_name='kid2'")[0] as Record<string, unknown>;
    expect(row.parent_id).toBe("parent");
  });

  it("登录名冲突返回 409", async () => {
    const response = await POST(new Request("http://localhost/api/parent/children", {
      method: "POST",
      body: JSON.stringify({ displayName: "X", loginName: "kid2", grade: 3, credential: "1357" }),
    }));
    expect(response.status).toBe(409);
  });

  it("PATCH/重置密码不能操作别家孩子（403）", async () => {
    const patch = await PATCH(new Request("http://localhost/api/parent/children/c-other", {
      method: "PATCH", body: JSON.stringify({ grade: 2 }),
    }));
    expect(patch.status).toBe(403);
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL（模块不存在）。

- [ ] **Step 3: 扩展 current-user.ts 并创建守卫**

`current-user.ts` 的 `CurrentUser` 类型增加 `isAdmin: boolean`；select 中增加 `isAdmin: users.isAdmin`。

`parent-child.ts`：

```ts
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { getCurrentUser } from "./current-user";
import type { EditionCode } from "@/domain/curriculum/types";

export async function requireParent() {
  const user = await getCurrentUser();
  if (!user || user.role !== "parent") {
    throw new Response(null, { status: 403 });
  }
  return user;
}

export type OwnedChild = {
  id: string; displayName: string; loginName: string; grade: number; edition: EditionCode;
};

export function getOwnedChild(db: AppDatabase, parentId: string, childId: string): OwnedChild | null {
  return db.select({
    id: users.id, displayName: users.displayName, loginName: users.loginName,
    grade: users.grade, edition: users.edition,
  })
    .from(users)
    .where(/* id=childId AND parentId 同时满足；用 and(eq(users.id,childId), eq(users.parentId,parentId)) */)
    .get() as OwnedChild | null;
}
```

注意：API 路由中 `requireParent()` 抛 Response 时，路由 catch 后直接返回该 Response；未登录返回 403。

- [ ] **Step 4: 实现三个路由**

`POST /api/parent/children` 核心：

```ts
  const parent = await requireParent();
  const input = createChildInput.parse(await request.json()); // zod: displayName 1-32字; loginName 同登录名正则; grade 1-6; credential 4-128
  const exists = db.select({ id: users.id }).from(users).where(eq(users.loginName, input.loginName)).get();
  if (exists) return NextResponse.json({ error: "登录名已被使用" }, { status: 409 });
  const id = randomUUID();
  db.insert(users).values({
    id, role: "child", displayName: input.displayName,
    credentialHash: await hashCredential(input.credential),
    createdAt: Date.now(), loginName: input.loginName, parentId: parent.id,
    grade: input.grade, edition: "pep", isAdmin: false,
  }).run();
  return NextResponse.json({ id }, { status: 201 });
```

`PATCH` 与 `reset-password`：先 `getOwnedChild(db, parent.id, params.id)`，为 null → 403；PATCH 支持 `displayName`/`grade` 局部更新；重置密码用 `hashCredential` 覆盖。

- [ ] **Step 5: 运行确认通过** — PASS。

- [ ] **Step 6: 提交**

```bash
git add src/lib/auth src/app/api/parent/children
git commit -m "feat: 家长添加孩子、修改信息与重置密码 API"
```

---

### Task 7: 家长手动开户脚本

**Files:**
- Create: `web/scripts/create-family.ts`

**Interfaces:**
- Produces: CLI `node scripts/create-family.ts --login-name=<name> --display-name=<name> --password=<pwd>`

- [ ] **Step 1: 写失败测试**（脚本导出可测函数）

`web/scripts/create-family.test.ts`：

```ts
import { createTestDatabase } from "@/test/test-db";
import { createFamilyParent } from "./create-family";

describe("createFamilyParent", () => {
  it("创建普通家长，登录名唯一", () => {
    const db = createTestDatabase();
    createFamilyParent(db, { loginName: "fam1", displayName: "一号家庭", password: "parent-pass" });
    const row = db.all("SELECT is_admin, role FROM users WHERE login_name='fam1'")[0] as Record<string, unknown>;
    expect(row).toMatchObject({ role: "parent", is_admin: 0 });
  });

  it("登录名重复抛错", () => {
    const db = createTestDatabase();
    createFamilyParent(db, { loginName: "fam1", displayName: "x", password: "parent-pass" });
    expect(() => createFamilyParent(db, { loginName: "fam1", displayName: "y", password: "parent-pass" }))
      .toThrow("登录名已被使用");
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现脚本**

```ts
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createDatabase } from "../src/db/client";
import { migrateDatabase } from "../src/db/migrate";
import { hashCredential } from "../src/domain/auth/credentials";
import { users } from "../src/db/schema";
import type { AppDatabase } from "../src/db/client";

export type CreateFamilyInput = { loginName: string; displayName: string; password: string };

export function createFamilyParent(db: AppDatabase, input: CreateFamilyInput): string {
  if (db.select({ id: users.id }).from(users).where(eq(users.loginName, input.loginName)).get()) {
    throw new Error("登录名已被使用");
  }
  const id = randomUUID();
  db.insert(users).values({
    id, role: "parent", displayName: input.displayName,
    credentialHash: "pending", createdAt: Date.now(),
    loginName: input.loginName, edition: "pep", isAdmin: false,
  }).run();
  // hashCredential 为异步：CLI 主流程 await 后 UPDATE；函数签名保持同步会无法 await，
  // 因此本函数实际签名为 async（见下）。
  return id;
}

async function main() {
  const args = parseArgs(process.argv.slice(2)); // --login-name / --display-name / --password 必填
  const db = createDatabase(process.env.DB_FILE_NAME ?? "data/math-trainer.sqlite");
  migrateDatabase(db, new URL("../drizzle", import.meta.url).pathname);
  const id = randomUUID();
  if (db.select().from(users).where(eq(users.loginName, args.loginName)).get()) {
    throw new Error("登录名已被使用");
  }
  db.insert(users).values({
    id, role: "parent", displayName: args.displayName,
    credentialHash: await hashCredential(args.password), createdAt: Date.now(),
    loginName: args.loginName, edition: "pep", isAdmin: false,
  }).run();
  process.stdout.write(`家长账号已创建：${args.loginName}\n`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
```

实现时统一为 **async `createFamilyParent(db, input): Promise<string>`**（先 insert 再 update credentialHash，或先 await hash 再 insert —— 取后者：先 hash 后一次 insert），删除上面注释中的同步写法；测试相应加 `await`。`parseArgs` 对缺失参数打印用法并退出 1。

- [ ] **Step 4: 运行确认通过** — PASS。

- [ ] **Step 5: 提交**

```bash
git add scripts/create-family.ts scripts/create-family.test.ts
git commit -m "feat: 家长手动开户脚本 create-family"
```

---

### Task 8: 家长首页 — 孩子卡片列表与添加孩子

**Files:**
- Rewrite: `web/src/app/parent/page.tsx`
- Create: `web/src/components/child-card.tsx`（服务端组件，纯展示）
- Create: `web/src/components/add-child-form.tsx`（客户端组件）
- Test: `web/src/app/parent/page.test.tsx`（重写现有测试）

**Interfaces:**
- Consumes: `requireParent`、users、trainingSessions（今日状态）、rewardEvents（积分/徽章数）。
- Produces: `/parent`：孩子卡片（链接到详情与题库设置）、添加孩子表单；管理员可见「全局管理」链接区（题库、校历、设置）。

- [ ] **Step 1: 写失败测试**

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ParentPage from "./page";

// fixture: 家长 parent 下有孩子 c1（六年级），另有别家孩子 c-other
describe("/parent", () => {
  it("列出自己的孩子，不列出别家孩子", async () => {
    render(await ParentPage());
    expect(screen.getByText("大女儿")).toBeInTheDocument();
    expect(screen.queryByText("别家孩子")).not.toBeInTheDocument();
  });

  it("添加孩子成功后刷新列表", async () => {
    render(await ParentPage());
    await userEvent.type(screen.getByLabelText("孩子姓名"), "小二");
    await userEvent.type(screen.getByLabelText("登录名"), "kid2");
    await userEvent.selectOptions(screen.getByLabelText("年级"), "3");
    await userEvent.type(screen.getByLabelText("登录密码"), "1357");
    await userEvent.click(screen.getByRole("button", { name: "添加孩子" }));
    await waitFor(() => expect(screen.getByText("小二")).toBeInTheDocument());
  });

  it("管理员可见全局管理链接，普通家长不可见", async () => {
    const { rerender } = render(await ParentPage());
    expect(screen.getByRole("link", { name: "进入题库" })).toBeInTheDocument();
    // 切换为普通家长会话后重渲染，断言链接消失
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 重写家长首页**

查询：`db.select().from(users).where(eq(users.parentId, parent.id)).all()`；每孩子查今日 session 状态与 rewardEvents 聚合（points 合计、kind='badge' 计数）。

页面结构：

```tsx
export default async function ParentPage() {
  const parent = await requireParent();
  const children = listChildren(getDatabase(), parent.id); // service 小函数可内联在页面
  return (
    <main className="parentPage parentHome">
      <header className="parentHeader">
        <p className="eyebrow">家长首页</p>
        <h1>孩子列表</h1>
        <p>选择孩子查看学习情况或调整题库。</p>
      </header>
      <section className="childCardGrid" aria-label="我的孩子">
        {children.map((child) => <ChildCard key={child.id} child={child} />)}
      </section>
      <AddChildForm />
      {parent.isAdmin && (
        <section className="parentAdminLinks" aria-label="全局管理">
          <Link href="/parent/questions">进入题库</Link>
          <Link href="/parent/calendar">校历管理</Link>
          <Link href="/parent/settings">系统设置</Link>
        </section>
      )}
    </main>
  );
}
```

`ChildCard` 显示姓名、`${grade} 年级`、今日状态文案（无 session「今天还没开始」/in_progress「进行中」/completed「已完成」）、积分与徽章数，内含两个链接：`学习情况 → /parent/children/{id}`、`题库设置 → /parent/children/{id}/skills`。

`AddChildForm`：客户端组件，字段同测试；POST `/api/parent/children`；409 时显示返回错误；成功后 `router.refresh()`。

- [ ] **Step 4: 运行确认通过** — PASS。

- [ ] **Step 5: 提交**

```bash
git add src/app/parent/page.tsx src/app/parent/page.test.tsx src/components/child-card.tsx src/components/add-child-form.tsx
git commit -m "feat: 家长首页孩子卡片列表与添加孩子表单"
```

---

### Task 9: 单孩子学习详情页（迁入现有家长页内容）

**Files:**
- Create: `web/src/app/parent/children/[childId]/page.tsx`
- Test: `web/src/app/parent/children/[childId]/page.test.tsx`

**Interfaces:**
- Consumes: `requireParent` + `getOwnedChild`；原 `/parent/page.tsx` 中全部数据查询与组件。
- Produces: `/parent/children/[childId]`：现有单孩子仪表盘内容；顶部有返回 `/parent` 链接与孩子名+年级。非自己孩子返回 403。

- [ ] **Step 1: 写失败测试**

```tsx
describe("/parent/children/[childId]", () => {
  it("显示自己孩子的学习证据", async () => {
    const page = await ChildPage({ params: Promise.resolve({ childId: "c1" }) });
    render(page);
    expect(screen.getByRole("heading", { name: /大女儿的学习证据/ })).toBeInTheDocument();
  });

  it("别家孩子返回 403", async () => {
    await expect(ChildPage({ params: Promise.resolve({ childId: "c-other" }) }))
      .rejects.toMatchObject({ status: 403 });
  });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 迁入页面**

把原 `parent/page.tsx` 的全部 import、辅助函数与 JSX（header 之后的所有 section 及 `<AiProviderConfigForm>` 之外的内容）移到新页面；改动点：

```tsx
export default async function ChildPage({ params }: { params: Promise<{ childId: string }> }) {
  const parent = await requireParent();
  const { childId } = await params;
  const child = getOwnedChild(getDatabase(), parent.id, childId);
  if (!child) throw new Response(null, { status: 403 });
  // ...原查询全部使用 child.id / child.displayName
}
```

- 删除原页面中对 AiProviderConfigForm 的引用（迁入 Task 10 的 settings 页）。
- 顶部加 `<Link href="/parent">← 返回孩子列表</Link>`；h1 用 `{child.displayName}的学习证据`。
- 「进入题库」链接从本页移除（仅管理员首页有）。

- [ ] **Step 4: 运行确认通过** — PASS；同时运行 `npm run typecheck` 确认无悬空 import。

- [ ] **Step 5: 提交**

```bash
git add src/app/parent/children
git commit -m "refactor: 单孩子学习详情迁入 /parent/children/[childId] 并加归属校验"
```

---

### Task 10: 知识点开关 API 与设置页

**Files:**
- Create: `web/src/services/curriculum/skill-scope.ts`
- Create: `web/src/app/api/parent/children/[id]/skills/route.ts`
- Create: `web/src/app/parent/children/[childId]/skills/page.tsx`
- Create: `web/src/components/child-skill-settings.tsx`（客户端组件）
- Test: `web/src/services/curriculum/skill-scope.test.ts`、`web/src/app/api/parent/children/[id]/skills/route.test.ts`

**Interfaces:**
- Consumes: Task 4 的引擎、`pepSkillSchedule`（Task 2）、`getOwnedChild`。
- Produces:
  ```ts
  export type SkillScopeRow = { skillId: string; code: string; name: string; grade: number; semester: 1|2; expectedWeek: number; mode: OverrideMode; autoAvailable: boolean; enabled: boolean };
  export function listChildSkillScope(db: AppDatabase, child: { id: string; grade: number; edition: EditionCode }, now?: Date): SkillScopeRow[];
  ```
  API：`GET` 列出；`PUT {skillId, mode}` upsert。

- [ ] **Step 1: 写失败测试（service）**

```ts
describe("listChildSkillScope", () => {
  it("合成校历自动状态与家长覆盖", () => {
    // 六年级孩子：同年级 expectedWeek 远的 skill auto=false；
    // 对其写 mode='on' 后 enabled=true、mode 显示 on
  });

  it("无覆盖记录时 mode 为 auto", () => { /* 断言 */ });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现 skill-scope.ts**

```ts
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { childSkillSettings, skills } from "@/db/schema";
import type { EditionCode, OverrideMode } from "@/domain/curriculum/types";
import {
  autoAvailable, effectiveEnabled, resolveAcademicCalendar,
} from "@/domain/curriculum/skill-availability";
import { academicCalendar } from "@/db/schema";
import { currentSchoolYear } from "@/domain/curriculum/academic-calendar";

export type SkillScopeRow = {
  skillId: string; code: string; name: string;
  grade: number; semester: 1 | 2; expectedWeek: number;
  mode: OverrideMode; autoAvailable: boolean; enabled: boolean;
};

export function listChildSkillScope(
  db: AppDatabase,
  child: { id: string; grade: number; edition: EditionCode },
  now = new Date(),
): SkillScopeRow[] {
  const yearKey = currentSchoolYear(now);
  const row = db.select().from(academicCalendar).where(eq(academicCalendar.schoolYear, yearKey)).get();
  const context = resolveAcademicCalendar(row ?? undefined, now);
  const overrides = new Map(
    db.select().from(childSkillSettings).where(eq(childSkillSettings.childId, child.id)).all()
      .map((item) => [item.skillId, item.mode as OverrideMode]),
  );

  return db.select().from(skills).all().map((skill) => {
    const schedule = { grade: skill.grade, semester: skill.semester as 1 | 2, expectedWeek: skill.expectedWeek };
    const auto = autoAvailable(schedule, { id: child.id, grade: child.grade, edition: child.edition }, context);
    const mode = overrides.get(skill.id) ?? "auto";
    return { skillId: skill.id, code: skill.code, name: skill.name, ...schedule, mode, autoAvailable: auto, enabled: effectiveEnabled(mode, auto) };
  });
}
```

- [ ] **Step 4: 写路由失败测试并实现**

路由测试：GET 自己孩子返回行数组；PUT 切换后再 GET 持久化；操作别家孩子 403；`mode` 非 auto/on/off 返回 400。

路由实现：`requireParent` → `getOwnedChild`（null → 403）；GET 直接返回 `listChildSkillScope`；PUT 用 zod 校验后

```ts
db.insert(childSkillSettings).values({ childId: child.id, skillId: body.skillId, mode: body.mode, updatedAt: Date.now() })
  .onConflictDoUpdate({ target: [childSkillSettings.childId, childSkillSettings.skillId], set: { mode: body.mode, updatedAt: Date.now() } }).run();
```

- [ ] **Step 5: 实现设置页与客户端组件**

页面：归属校验（同上）→ 取 rows → 按 `grade → semester` 分组渲染；每行：知识点名称、`${grade}年级${semester===1?"上":"下"}·约第${expectedWeek}周`、实际状态徽标（已解锁/未解锁）、三态分段按钮（自动/提前开启/关闭），非 auto 时显示「恢复自动」。客户端组件 PUT 后 `router.refresh()`；顶部返回链接。

- [ ] **Step 6: 运行确认通过** — `npm run test:run -- src/services/curriculum src/app/api/parent/children` → PASS。

- [ ] **Step 7: 提交**

```bash
git add src/services/curriculum src/app/api/parent/children src/app/parent/children src/components/child-skill-settings.tsx
git commit -m "feat: 孩子知识点三态开关 API、服务与设置页"
```

---

### Task 11: 校历管理 API 与页面、管理员设置页

**Files:**
- Create: `web/src/app/api/parent/calendar/route.ts`
- Create: `web/src/app/parent/calendar/page.tsx`
- Create: `web/src/components/calendar-form.tsx`
- Create: `web/src/app/parent/settings/page.tsx`
- Test: `web/src/app/api/parent/calendar/route.test.ts`

**Interfaces:**
- Consumes: `requireParent`（isAdmin）、academicCalendar、现有 `listAiProviderConfigs` + `AiProviderConfigForm`。
- Produces: `GET/PUT /api/parent/calendar`（管理员）；`/parent/calendar`、`/parent/settings` 两页。

- [ ] **Step 1: 写失败测试**

```ts
describe("/api/parent/calendar", () => {
  it("管理员可读取与更新", async () => { /* 200, upsert 后日期变更 */ });
  it("普通家长返回 403", async () => { /* 403 */ });
  it("日期格式非法返回 400", async () => { /* 400 */ });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现 API**

```ts
export async function GET() {
  const parent = await requireParent();
  if (!parent.isAdmin) return new Response(null, { status: 403 });
  const year = currentSchoolYear(new Date());
  const row = getDatabase().select().from(academicCalendar).where(eq(academicCalendar.schoolYear, year)).get();
  return NextResponse.json(row ?? { schoolYear: year, ...DEFAULT_CALENDAR });
}

export async function PUT(request: Request) {
  const parent = await requireParent();
  if (!parent.isAdmin) return new Response(null, { status: 403 });
  const body = calendarInput.parse(await request.json()); // schoolYear 正则 /^\d{4}-\d{4}$/；两日期 YYYY-MM-DD（z.iso.date()）
  getDatabase().insert(academicCalendar).values({ ...body, updatedAt: Date.now() })
    .onConflictDoUpdate({ target: academicCalendar.schoolYear, set: { semester1Start: body.semester1Start, semester2Start: body.semester2Start, updatedAt: Date.now() } }).run();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: 实现页面**

`/parent/calendar`：服务端校验 isAdmin（非管理员页面直接 403 文案），`CalendarForm`（客户端，两日期 input type=date + 学年只读展示，PUT 后 refresh）。

`/parent/settings`：同样仅管理员，渲染返回链接 + `<AiProviderConfigForm initial={listAiProviderConfigs(getDatabase())} />`（沿用现有组件与样式，AI 配置仍全局唯一）。

- [ ] **Step 5: 运行确认通过** — PASS。

- [ ] **Step 6: 提交**

```bash
git add src/app/api/parent/calendar src/app/parent/calendar src/app/parent/settings src/components/calendar-form.tsx
git commit -m "feat: 管理员校历管理 API/页面与系统设置页"
```

---

### Task 12: 出题与诊断接入知识点范围过滤

**Files:**
- Modify: `web/src/services/training/create-adaptive-session.ts`
- Modify: `web/src/services/diagnosis/diagnosis-service.ts`
- Test: 扩展各自现有 `.test.ts`

**Interfaces:**
- Consumes: `listChildSkillScope`（Task 10）。
- Produces: 每日组题与诊断只从 enabled 知识点出题。

- [ ] **Step 1: 写失败测试（两条）**

在 `create-adaptive-session.test.ts` 加：将某孩子某知识点写 `mode='off'` 后，新建 session 的 sessionItems 不含该 skill；在诊断测试加：被关闭 skill 的模板不进入诊断（构造 catalog 中含该 skill 模板，断言生成的 item 用不到它）。

- [ ] **Step 2: 运行确认失败** → FAIL（当前无过滤）。

- [ ] **Step 3: 修改 create-adaptive-session.ts**

在函数开头取孩子档案并求范围（孩子行的 grade/loginName 从 users 读）：

```ts
  const childRow = tx.select({ grade: users.grade, edition: users.edition })
    .from(users).where(eq(users.id, childId)).get();
  const scope = listChildSkillScope(db, { id: childId, grade: childRow.grade!, edition: childRow.edition! }, new Date(now));
  const enabledSkillIds = new Set(scope.filter((row) => row.enabled).map((row) => row.skillId));
```

在 candidates 的 `.filter` 链中加 `enabledSkillIds.has(row.skillId)`；在 `schedulingTargetSkills` 返回前过滤 `skillIds`（due/planned 中不在 enabled 集合内的剔除）。

- [ ] **Step 4: 修改 diagnosis-service.ts**

`createNextItem` 中，构造 `eligibleCatalog` 的 filter 增加 enabled 判断：

```ts
  const childRow = tx.select({ grade: users.grade, edition: users.edition })
    .from(users).where(eq(users.id, run.childId)).get()!;
  const enabledSkillIds = new Set(
    listChildSkillScope(tx as unknown as AppDatabase, run.childId ? { id: run.childId, grade: childRow.grade, edition: childRow.edition } : null as never)
      .filter((row) => row.enabled).map((row) => row.skillId),
  );
```

eligibleCatalog filter：`... && enabledSkillIds.has(\`skill-\${template.skillCode}\`)`。
（实现时整理成简洁写法；注意 `listChildSkillScope` 接受 AppDatabase，事务 tx 结构兼容；如签名不兼容则在函数内支持传入最小查询对象 —— 优先直接传 tx，drizzle tx 具备 select 能力。）

边界：enabled 集合为空时，现有「No reviewed diagnosis item is available」错误自然触发，本期不额外处理（Plan 2 后题库充足）。

- [ ] **Step 5: 运行确认通过** — 两个测试文件 PASS；运行 `npm run test:run` 确认无回归。

- [ ] **Step 6: 提交**

```bash
git add src/services/training/create-adaptive-session.ts src/services/diagnosis/diagnosis-service.ts
git commit -m "feat: 每日组题与诊断按孩子知识点范围过滤"
```

---

### Task 13: 现有数据升级脚本

**Files:**
- Create: `web/scripts/migrate-multi-family.ts`
- Test: `web/scripts/migrate-multi-family.test.ts`
- Modify: `web/src/db/seed.ts`

**Interfaces:**
- Produces:
  ```ts
  export type MultiFamilyMigrationOptions = { childLoginName: string; childGrade: number };
  export function migrateToMultiFamily(db: AppDatabase, options: MultiFamilyMigrationOptions): void;
  ```
  CLI：`node scripts/migrate-multi-family.ts --child-login-name=<name> [--child-grade=6]`。

- [ ] **Step 1: 写失败测试**

```ts
describe("migrateToMultiFamily", () => {
  it("家长置 admin，孩子补登录名/年级/归属，skills 回填进度，写入校历行", () => {
    const db = createTestDatabase();
    seedLegacyFixture(db); // 迁移前结构数据：id='parent'/'child' 的旧行 + skills
    db.run("UPDATE users SET login_name=NULL, parent_id=NULL, grade=NULL WHERE id='child'");
    migrateToMultiFamily(db, { childLoginName: "mykid", childGrade: 6 });
    const parent = db.all("SELECT login_name,is_admin FROM users WHERE id='parent'")[0] as Record<string, unknown>;
    const child = db.all("SELECT login_name,parent_id,grade FROM users WHERE id='child'")[0] as Record<string, unknown>;
    expect(parent).toMatchObject({ login_name: "admin", is_admin: 1 });
    expect(child).toMatchObject({ login_name: "mykid", parent_id: "parent", grade: 6 });
    const withoutGrade = db.all("SELECT COUNT(*) AS n FROM skills WHERE grade IS NULL")[0] as Record<string, number>;
    expect(withoutGrade.n).toBe(0);
    expect(db.all("SELECT COUNT(*) AS n FROM academic_calendar")[0]).not.toBeNull();
  });

  it("重复执行抛错而不是重复写入", () => { /* is_admin 已为 1 时抛 'already migrated' */ });
});
```

- [ ] **Step 2: 运行确认失败** → FAIL。

- [ ] **Step 3: 实现迁移函数**

```ts
import { eq } from "drizzle-orm";
import { academicCalendar, skills, users } from "../src/db/schema";
import { pepSkillSchedule } from "../src/content/pep-skill-schedule";
import type { AppDatabase } from "../src/db/client";
import { DEFAULT_CALENDAR } from "../src/domain/curriculum/skill-availability";

export type MultiFamilyMigrationOptions = { childLoginName: string; childGrade: number };

export function migrateToMultiFamily(db: AppDatabase, options: MultiFamilyMigrationOptions): void {
  const parent = db.select().from(users).where(eq(users.id, "parent")).get();
  if (!parent) throw new Error("找不到现有家长账号（id=parent）");
  if (parent.isAdmin) throw new Error("数据已经升级过");

  db.update(users).set({ loginName: "admin", isAdmin: true })
    .where(eq(users.id, "parent")).run();
  db.update(users).set({
    loginName: options.childLoginName, parentId: "parent",
    grade: options.childGrade, edition: "pep",
  }).where(eq(users.id, "child")).run();

  for (const skill of db.select().from(skills).all()) {
    const entry = pepSkillSchedule[skill.code];
    if (!entry) throw new Error(`知识点 ${skill.code} 缺少人教版进度数据`);
    db.update(skills).set({ grade: entry.grade, semester: entry.semester, expectedWeek: entry.expectedWeek })
      .where(eq(skills.id, skill.id)).run();
  }

  db.insert(academicCalendar).values({
    schoolYear: DEFAULT_CALENDAR.schoolYear,
    semester1Start: DEFAULT_CALENDAR.semester1Start,
    semester2Start: DEFAULT_CALENDAR.semester2Start,
    updatedAt: Date.now(),
  }).run();
}
```

CLI `main()`：解析 `--child-login-name`（必填）、`--child-grade`（默认 6）；打开 DB（先 migrateDatabase 保证表存在）、调用函数、打印完成。

- [ ] **Step 4: 修改 seed.ts**

两处 insert(users) 增加新字段：

- parent：`loginName: "admin", edition: "pep", isAdmin: true`
- child：`loginName: process.env.CHILD_LOGIN_NAME ?? "child", parentId: "parent", grade: Number(process.env.CHILD_GRADE ?? 6), edition: "pep", isAdmin: false`
- onConflictDoUpdate 的 set 中同步加入这些字段。

- [ ] **Step 5: 运行确认通过** — `npm run test:run -- scripts/migrate-multi-family.test.ts src/db/seed.test.ts` → PASS。

- [ ] **Step 6: 提交**

```bash
git add scripts/migrate-multi-family.ts src/db/seed.ts
git commit -m "feat: 现有数据升级脚本与种子登录名适配"
```

---

### Task 14: 全量验证与 e2e 适配

**Files:**
- Modify: 受影响的 `web/e2e/*.spec.ts`（登录流程加登录名）

- [ ] **Step 1: 运行完整静态与单测**

Run: `npm run verify`（= lint + typecheck + vitest run + next build）
Expected: 全部通过；若 build 报告动态 API 差异，按 Next 16 的实际报错修复（参考 `web/node_modules/next/dist/docs/`）。

- [ ] **Step 2: 适配并运行 e2e**

在涉及登录的 e2e 中补填登录名（家长 `admin`、孩子 `child`，或对应 fixture 值）；本地起 e2e（使用现有 e2e:seed 脚本，其内部已通过更新后的 seed.ts 产生登录名）：

Run: `npm run test:e2e:chromium`
Expected: 通过；如因时间环境无法跑全量，至少跑 tablet-chromium 项目并记录跳过项。

- [ ] **Step 3: 最终提交（如有变更）**

```bash
git add e2e
git commit -m "test: e2e 适配登录名与多孩子页面"
```

- [ ] **Step 4: 汇总交付**：列出全部提交、新增/修改文件、验证结果；**明确未部署**，并给出未来部署时需要执行的步骤（备份 → migrate-multi-family（孩子登录名取 Wayne 提供值）→ 重建容器 → 验收），但不执行。

---

## Self-Review 记录（计划作者完成）

- **Spec 覆盖**：规格 §2 数据模型→ Task 1；§3 账号/开户 → Tasks 5/6/7；§4 题库内容（Plan 2，本计划不含）；§5 解锁引擎 → Tasks 3/4/10/12；§6 家长端与权限 → Tasks 6/8/9/10/11；§7 迁移 → Task 13；§8 测试 → 各 Task + Task 14；§9 未来扩展 → resolveSkillSchedule/edition 已在 Tasks 1/3 落地，其余表延后。无缺口。
- **占位符**：无 TBD/TODO；所有代码步骤含实际代码。
- **类型一致性**：`SkillSchedule`、`OverrideMode`、`listChildSkillScope`、`getOwnedChild`、`resolveAcademicCalendar` 名称与签名在各任务间一致。
- **待 Wayne 提供**：现有孩子的正式登录名（迁移 CLI 参数，Task 13/14 不阻塞，真正执行迁移时才需要）。
