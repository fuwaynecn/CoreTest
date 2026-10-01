import { eq } from "drizzle-orm";
import { academicCalendar } from "@/db/schema";
import { createTestDatabase } from "@/test/test-db";
import { currentSchoolYear } from "@/domain/curriculum/academic-calendar";
import { DEFAULT_CALENDAR } from "@/domain/curriculum/skill-availability";

const state = vi.hoisted(() => ({
  db: undefined as unknown,
  parent: { id: "admin", role: "parent", displayName: "管理员", isAdmin: true } as
    | { id: string; role: string; displayName: string; isAdmin: boolean }
    | null,
}));

vi.mock("@/db/client", async (original) => ({
  ...(await original<typeof import("@/db/client")>()),
  getDatabase: () => state.db,
}));

vi.mock("@/lib/auth/parent-child", () => ({
  requireParent: () => {
    if (!state.parent || state.parent.role !== "parent") {
      throw new Response(null, { status: 403 });
    }
    return state.parent;
  },
}));

import { GET, PUT } from "./route";

beforeEach(() => {
  const db = createTestDatabase();
  state.db = db;
  state.parent = { id: "admin", role: "parent", displayName: "管理员", isAdmin: true };
});

test("1. Admin GET with no calendar row returns default shape for current year", async () => {
  const response = await GET(new Request("http://localhost/api/parent/calendar"));
  expect(response.status).toBe(200);
  const body = await response.json();
  const year = currentSchoolYear(new Date());
  expect(body.schoolYear).toBe(year);
  expect(body.semester1Start).toBe(DEFAULT_CALENDAR.semester1Start);
  expect(body.semester2Start).toBe(DEFAULT_CALENDAR.semester2Start);
});

test("2. Admin GET with existing row returns stored dates", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;
  const year = currentSchoolYear(new Date());
  db.insert(academicCalendar).values({
    schoolYear: year,
    semester1Start: "2025-09-05",
    semester2Start: "2026-02-25",
    updatedAt: 1000,
  }).run();

  const response = await GET(new Request("http://localhost/api/parent/calendar"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.schoolYear).toBe(year);
  expect(body.semester1Start).toBe("2025-09-05");
  expect(body.semester2Start).toBe("2026-02-25");
});

test("3. Admin PUT valid body upserts and sets updated_at", async () => {
  const response = await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026-2027",
      semester1Start: "2026-09-01",
      semester2Start: "2027-02-22",
    }),
  }));
  expect(response.status).toBe(200);
  const payload = await response.json();
  expect(payload.ok).toBe(true);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const row = db.select().from(academicCalendar)
    .where(eq(academicCalendar.schoolYear, "2026-2027"))
    .get();
  expect(row).toBeDefined();
  expect(row?.semester1Start).toBe("2026-09-01");
  expect(row?.semester2Start).toBe("2027-02-22");
  expect(row?.updatedAt).toBeGreaterThan(0);
});

test("4. PUT same schoolYear twice → one row with latest values (upsert)", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;

  await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026-2027",
      semester1Start: "2026-09-01",
      semester2Start: "2027-02-22",
    }),
  }));

  await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026-2027",
      semester1Start: "2026-09-01",
      semester2Start: "2027-03-01",
    }),
  }));

  const rows = db.select().from(academicCalendar)
    .where(eq(academicCalendar.schoolYear, "2026-2027"))
    .all();
  expect(rows.length).toBe(1);
  expect(rows[0].semester2Start).toBe("2027-03-01");
});

test("5. Non-admin parent gets 403 on GET and PUT, no row written", async () => {
  state.parent = { id: "parent1", role: "parent", displayName: "普通家长", isAdmin: false };

  const getRes = await GET(new Request("http://localhost/api/parent/calendar"));
  expect(getRes.status).toBe(403);

  const putRes = await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026-2027",
      semester1Start: "2026-09-01",
      semester2Start: "2027-02-22",
    }),
  }));
  expect(putRes.status).toBe(403);

  const db = state.db as ReturnType<typeof createTestDatabase>;
  const count = db.select().from(academicCalendar).all().length;
  expect(count).toBe(0);
});

test("6. Unauthenticated gets 403 on GET", async () => {
  const originalParent = state.parent;
  try {
    state.parent = null;
    const response = await GET(new Request("http://localhost/api/parent/calendar"));
    expect(response.status).toBe(403);
  } finally {
    state.parent = originalParent;
  }
});

test("7. Bad input PUT returns 400 and no rows written", async () => {
  const db = state.db as ReturnType<typeof createTestDatabase>;

  // bad schoolYear format
  const res1 = await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026/27",
      semester1Start: "2026-09-01",
      semester2Start: "2027-02-22",
    }),
  }));
  expect(res1.status).toBe(400);

  // bad date format
  const res2 = await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026-2027",
      semester1Start: "09-01-2026",
      semester2Start: "2027-02-22",
    }),
  }));
  expect(res2.status).toBe(400);

  // missing semester2Start
  const res3 = await PUT(new Request("http://localhost/api/parent/calendar", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      schoolYear: "2026-2027",
      semester1Start: "2026-09-01",
    }),
  }));
  expect(res3.status).toBe(400);

  const count = db.select().from(academicCalendar).all().length;
  expect(count).toBe(0);
});
