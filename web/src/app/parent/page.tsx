import { and, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { getDatabase } from "@/db/client";
import { rewardEvents, trainingSessions, users } from "@/db/schema";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import AddChildForm from "@/components/add-child-form";
import ChildCard from "@/components/child-card";

export type ChildSummary = {
  id: string;
  displayName: string;
  grade: number | null;
  loginName: string | null;
  todayStatus: "none" | "in_progress" | "completed";
  pointsTotal: number;
  badgeCount: number;
};

export default async function ParentPage() {
  const parent = await requireRole("parent");
  const db = getDatabase();
  const rows = db.select().from(users).where(eq(users.parentId, parent.id)).all();

  const today = shanghaiDateKey();

  const children: ChildSummary[] = rows.map((row) => {
    const session = db.select({ status: trainingSessions.status })
      .from(trainingSessions)
      .where(and(
        eq(trainingSessions.childId, row.id),
        eq(trainingSessions.sessionDate, today),
      ))
      .get();

    const pointsRow = db.select({ total: sql<number>`COALESCE(SUM(${rewardEvents.points}),0)` })
      .from(rewardEvents)
      .where(eq(rewardEvents.childId, row.id))
      .get();

    const badgeRow = db.select({ count: sql<number>`COUNT(*)` })
      .from(rewardEvents)
      .where(and(
        eq(rewardEvents.childId, row.id),
        eq(rewardEvents.kind, "badge"),
      ))
      .get();

    let todayStatus: ChildSummary["todayStatus"] = "none";
    if (session) {
      if (session.status === "completed") {
        todayStatus = "completed";
      } else {
        // in_progress and completed_early both map to "进行中"
        todayStatus = "in_progress";
      }
    }

    return {
      id: row.id,
      displayName: row.displayName,
      grade: row.grade ?? null,
      loginName: row.loginName ?? null,
      todayStatus,
      pointsTotal: pointsRow?.total ?? 0,
      badgeCount: badgeRow?.count ?? 0,
    };
  });

  const hasChildren = children.length > 0;

  return (
    <main className="parentPage">
      <header className="parentHeader">
        <div>
          <p className="eyebrow">家长查看</p>
          <h1>{hasChildren ? "孩子列表" : "还没有孩子账号"}</h1>
          {!hasChildren && (
            <p>创建孩子账号后，这里会显示每个孩子的学习情况。</p>
          )}
        </div>
        <form method="post" action="/api/auth/logout" className="logoutForm">
          <button type="submit" className="secondaryButton">退出登录</button>
        </form>
      </header>

      {hasChildren && (
        <section aria-label="我的孩子" className="childCardGrid">
          {children.map((child) => (
            <ChildCard key={child.id} child={child} />
          ))}
        </section>
      )}

      <AddChildForm />

      {parent.isAdmin && (
        <section aria-label="全局管理" className="adminLinks">
          <h2>全局管理</h2>
          <ul>
            <li><Link href="/parent/questions">进入题库</Link></li>
            <li><Link href="/parent/calendar">校历管理</Link></li>
            <li><Link href="/parent/settings">系统设置</Link></li>
          </ul>
        </section>
      )}
    </main>
  );
}
