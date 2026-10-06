import Link from "next/link";
import { redirect } from "next/navigation";
import { asc } from "drizzle-orm";
import { QuestionBankEditor } from "@/components/question-bank-editor";
import { getDatabase } from "@/db/client";
import { skills } from "@/db/schema";
import { shanghaiDateKey } from "@/domain/time/shanghai-calendar";
import { requireRole } from "@/lib/auth/current-user";
import type { QuestionBankFilters } from "@/services/parent/question-bank";
import { listQuestionBank } from "@/services/parent/question-bank";
import { ensureQuestionBankFresh } from "@/services/questions/question-bank-refresh";

const domains = [
  ["number_operations", "数与运算"], ["equation_algebra", "方程与代数"], ["geometry_space", "图形与空间"],
  ["data_statistics", "数据与统计"], ["application_modeling", "应用与建模"], ["thinking_habits", "数学思维与习惯"],
] as const;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function valueOf(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function formatTime(value: number | null) {
  if (value === null) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short" }).format(value);
}

function answerLabel(row: ReturnType<typeof listQuestionBank>[number]) {
  return row.answerSpec.kind === "number"
    ? `${row.answerSpec.value}${row.answerSpec.unit ? ` ${row.answerSpec.unit}` : ""}`
    : row.answerSpec.value;
}

const sessionKindLabels = {
  diagnostic: "诊断训练",
  practice: "练习训练",
  daily: "每日训练",
  review: "复习训练",
  assessment: "评估训练",
} as const;

export default async function ParentQuestionsPage({ searchParams }: { searchParams: SearchParams }) {
  const parent = await requireRole("parent");
  if (!parent.isAdmin) redirect("/parent");
  const db = getDatabase();
  let refreshError = false;
  try {
    ensureQuestionBankFresh(db, shanghaiDateKey());
  } catch {
    refreshError = true;
  }

  const params = await searchParams;
  const skillId = valueOf(params.skillId);
  const domain = valueOf(params.domain);
  const difficultyValue = valueOf(params.difficulty);
  const difficulty = difficultyValue && ["1", "2", "3", "4"].includes(difficultyValue) ? Number(difficultyValue) as 1 | 2 | 3 | 4 : undefined;
  const rawStatusValue = valueOf(params.status);
  const statusValue = rawStatusValue === "all" || rawStatusValue === "active" || rawStatusValue === "inactive"
    ? rawStatusValue : "active";
  const status = statusValue === "all" ? undefined : statusValue;
  const filters: QuestionBankFilters = {};
  if (skillId) filters.skillId = skillId;
  if (domains.some(([key]) => key === domain)) filters.domain = domain as QuestionBankFilters["domain"];
  if (difficulty) filters.difficulty = difficulty;
  if (status) filters.status = status;
  const rows = listQuestionBank(db, filters).slice(0, 100);
  const skillOptions = db.select({ id: skills.id, name: skills.name }).from(skills).orderBy(asc(skills.code)).all();

  return (
    <main className="parentPage questionBankPage">
      <header className="parentHeader">
        <div><p className="eyebrow">家长查看 · 题库管理</p><h1>查看题库</h1><p>快速筛选、检查并修正正在使用的题目。</p></div>
        <Link className="primaryButton" href="/parent">返回学习证据</Link>
      </header>
      {refreshError && <p className="questionBankRefreshError" role="alert">题库刷新失败，以下显示现有库存。</p>}
      <form className="questionBankFilters" method="get">
        <label>知识点<select name="skillId" defaultValue={skillId ?? ""}><option value="">全部知识点</option>{skillOptions.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
        <label>领域<select name="domain" defaultValue={domain ?? ""}><option value="">全部领域</option>{domains.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>难度<select name="difficulty" defaultValue={difficultyValue ?? ""}><option value="">全部难度</option>{[1, 2, 3, 4].map((level) => <option key={level} value={level}>{level} 级</option>)}</select></label>
        <label>状态<select name="status" defaultValue={statusValue}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select></label>
        <button type="submit">筛选</button>
      </form>
      <section className="questionBankList" aria-label="题库题目">
        <div className="sectionHeading"><h2>题目列表</h2><p>显示 {rows.length} / 最多 100 条</p></div>
        {rows.length === 0 ? <p className="emptyEvidence">当前筛选没有题目。</p> : rows.map((row) => (
          <details className="questionBankItem" data-testid="question-bank-item" key={row.id}>
            <summary><span>{row.stem}</span><span className="questionBankMeta">{row.skillName} · {row.difficulty} 级 · {row.active ? "启用" : "停用"}</span></summary>
            <div className="questionBankDetails">
              <dl className="questionBankFacts"><div><dt>正确答案</dt><dd>{answerLabel(row)}</dd></div><div><dt>解析</dt><dd>{row.explanation}</dd></div><div><dt>题目来源</dt><dd>{row.templateName}</dd></div><div><dt>模板 ID</dt><dd>{row.templateId}</dd></div><div><dt>生成时间</dt><dd><time dateTime={new Date(row.generatedAt).toISOString()}>{formatTime(row.generatedAt)}</time></dd></div><div><dt>最近更新时间</dt><dd><time dateTime={new Date(row.updatedAt).toISOString()}>{formatTime(row.updatedAt)}</time></dd></div><div><dt>最近使用</dt><dd>{formatTime(row.lastUsedAt)}</dd></div><div><dt>历史使用</dt><dd>{row.usage.length === 0 ? "暂无" : <ul className="questionBankUsage">{row.usage.map((usage) => <li key={`${usage.sessionDate}-${usage.sessionKind}`}><time dateTime={usage.sessionDate}>{usage.sessionDate}</time> · {sessionKindLabels[usage.sessionKind]} · <span>{usage.count} 次</span></li>)}</ul>}</dd></div></dl>
              <QuestionBankEditor row={row} skillOptions={skillOptions} />
            </div>
          </details>
        ))}
      </section>
    </main>
  );
}
