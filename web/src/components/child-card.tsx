import Link from "next/link";
import type { ChildSummary } from "@/app/parent/page";

type Props = { child: ChildSummary };

export default function ChildCard({ child }: Props) {
  const todayText = child.todayStatus === "completed"
    ? "已完成"
    : child.todayStatus === "in_progress"
      ? "进行中"
      : "今天还没开始";

  return (
    <article className="childCard">
      <div className="childCardHeader">
        <h3>{child.displayName}</h3>
        <span className="childGrade">
          {child.grade ? `${child.grade} 年级` : "未设置年级"}
        </span>
      </div>
      <p className="childTodayStatus">{todayText}</p>
      <div className="childStats">
        <span>{child.pointsTotal} 积分</span>
        <span>{child.badgeCount} 枚徽章</span>
      </div>
      <div className="childCardActions">
        <Link href={`/parent/children/${child.id}`}>学习情况</Link>
        <Link href={`/parent/children/${child.id}/skills`}>题库设置</Link>
      </div>
    </article>
  );
}
