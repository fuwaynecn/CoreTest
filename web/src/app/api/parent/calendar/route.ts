import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDatabase } from "@/db/client";
import { academicCalendar } from "@/db/schema";
import { currentSchoolYear } from "@/domain/curriculum/academic-calendar";
import { DEFAULT_CALENDAR } from "@/domain/curriculum/skill-availability";
import { requireParent } from "@/lib/auth/parent-child";

const calendarInput = z.object({
  schoolYear: z.string().regex(/^\d{4}-\d{4}$/),
  semester1Start: z.iso.date(),
  semester2Start: z.iso.date(),
});

export async function GET(_request: Request) {
  try {
    const parent = await requireParent();
    if (!parent.isAdmin) return new Response(null, { status: 403 });

    const db = getDatabase();
    const year = currentSchoolYear(new Date());
    const row = db.select().from(academicCalendar)
      .where(eq(academicCalendar.schoolYear, year))
      .get();

    return NextResponse.json(row ?? { ...DEFAULT_CALENDAR, schoolYear: year });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const parent = await requireParent();
    if (!parent.isAdmin) return new Response(null, { status: 403 });

    const parsed = calendarInput.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "日期格式不正确" }, { status: 400 });
    }

    const body = parsed.data;
    const now = Date.now();

    getDatabase().insert(academicCalendar)
      .values({
        schoolYear: body.schoolYear,
        semester1Start: body.semester1Start,
        semester2Start: body.semester2Start,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: academicCalendar.schoolYear,
        set: {
          semester1Start: body.semester1Start,
          semester2Start: body.semester2Start,
          updatedAt: now,
        },
      })
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
