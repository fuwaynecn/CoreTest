import { eq } from "drizzle-orm";
import Link from "next/link";
import { getDatabase } from "@/db/client";
import { academicCalendar } from "@/db/schema";
import { currentSchoolYear } from "@/domain/curriculum/academic-calendar";
import { DEFAULT_CALENDAR } from "@/domain/curriculum/skill-availability";
import { requireParent } from "@/lib/auth/parent-child";
import { CalendarForm } from "@/components/calendar-form";

export default async function CalendarPage() {
  const parent = await requireParent();
  if (!parent.isAdmin) throw new Response(null, { status: 403 });

  const db = getDatabase();
  const year = currentSchoolYear(new Date());
  const row = db.select().from(academicCalendar)
    .where(eq(academicCalendar.schoolYear, year))
    .get();

  const initial = row
    ? { schoolYear: row.schoolYear, semester1Start: row.semester1Start, semester2Start: row.semester2Start }
    : { ...DEFAULT_CALENDAR, schoolYear: year };

  return (
    <main className="parentPage">
      <header className="parentHeader">
        <div>
          <p className="eyebrow">
            <Link href="/parent">← 返回孩子列表</Link>
          </p>
          <h1>校历管理</h1>
          <p>设置每学年的开学日期，用于自动计算技能解锁时间。</p>
        </div>
      </header>

      <section className="parentSection" aria-labelledby="calendar-heading">
        <h2 id="calendar-heading">当前学年校历</h2>
        <CalendarForm initial={initial} />
      </section>
    </main>
  );
}
