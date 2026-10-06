import Link from "next/link";
import { notFound } from "next/navigation";
import { ChildSkillSettings } from "@/components/child-skill-settings";
import { getDatabase } from "@/db/client";
import { requireRole } from "@/lib/auth/current-user";
import { getOwnedChild } from "@/lib/auth/parent-child";
import { listChildSkillScope } from "@/services/curriculum/skill-scope";

export default async function ChildSkillsPage({ params }: { params: Promise<{ childId: string }> }) {
  const parent = await requireRole("parent");
  const { childId } = await params;
  const db = getDatabase();
  const child = getOwnedChild(db, parent.id, childId);
  if (!child) notFound();

  const rows = listChildSkillScope(db, { id: child.id, grade: child.grade, edition: child.edition });

  // Group by grade then semester
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.grade}-${row.semester}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
    const [ag, as] = a.split("-").map(Number);
    const [bg, bs] = b.split("-").map(Number);
    if (ag !== bg) return ag - bg;
    return as - bs;
  });

  return (
    <main className="parentPage">
      <Link href="/parent">← 返回孩子列表</Link>
      <header className="parentHeader">
        <div>
          <p className="eyebrow">家长设置</p>
          <h1>{child.displayName}的题库设置</h1>
          <p>按年级和学期查看知识点的解锁状态，可以手动提前开启或关闭特定知识点。</p>
        </div>
      </header>

      {sortedKeys.map((key) => {
        const [grade, semester] = key.split("-").map(Number);
        const groupRows = groups.get(key)!;
        return (
          <section key={key} className="parentSection">
            <div className="sectionHeading">
              <h2>{grade}年级{semester === 1 ? "上" : "下"}册</h2>
              <p>{groupRows.length} 个知识点</p>
            </div>
            <ChildSkillSettings rows={groupRows} childId={child.id} />
          </section>
        );
      })}
    </main>
  );
}