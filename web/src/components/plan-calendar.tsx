import type { PlanDashboard } from "@/services/parent/get-plan-dashboard";
export function PlanCalendar({ days }: { days: PlanDashboard["nextSevenDays"] }) { return <ul className="planCalendar">{days.map((day) => <li key={day.date} data-kind={day.kind}><time>{day.date}</time><strong>{day.kind === "rest" ? "休息日" : "训练预览"}</strong><span>不保存</span></li>)}</ul>; }
