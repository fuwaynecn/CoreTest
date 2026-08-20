import { asc, count, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { attempts, diagnosticRuns, sessionItems, trainingSessions, users } from "@/db/schema";
import type { InitialDiagnosisReport } from "@/domain/diagnosis/types";
import { requireRole } from "@/lib/auth/current-user";
import { getParentEvidence } from "@/services/training/get-parent-evidence";

const statusLabels = {
  needs_support: "需要支持",
  learning: "正在学习",
  basic: "基础掌握",
} as const;

const domainLabels = {
  number_operations: "数与运算",
  equation_algebra: "方程与代数",
  geometry_space: "图形与空间",
  data_statistics: "数据与统计",
  application_modeling: "应用与建模",
  thinking_habits: "数学思维与习惯",
} as const;

function parseInitialReport(value: string | null): InitialDiagnosisReport | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || !("domains" in parsed) || !Array.isArray(parsed.domains)) {
    throw new Error("Initial diagnosis report is invalid");
  }
  return parsed as InitialDiagnosisReport;
}

function recommendation(answered: number, correct: number) {
  if (answered === 0) return "先让孩子完成今天的训练";
  if (correct < answered) return "本周先看错题原因，不额外加量";
  return "保持当前训练节奏";
}

function formatAccuracy(accuracy: number | null) {
  return accuracy === null ? "暂无" : `${Math.round(accuracy * 100)}%`;
}

function formatSubmittedAt(value: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function ParentPage() {
  await requireRole("parent");
  const db = getDatabase();
  const child = db.select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(eq(users.role, "child"))
    .limit(1)
    .get();

  if (!child) {
    return (
      <main className="parentPage parentEmpty">
        <p className="eyebrow">家长查看</p>
        <h1>还没有孩子账号</h1>
        <p>创建孩子账号后，这里会显示每次作答的原题和答案。</p>
      </main>
    );
  }

  const evidence = getParentEvidence(db, child.id);
  const diagnosisRun = db.select().from(diagnosticRuns)
    .where(eq(diagnosticRuns.childId, child.id))
    .orderBy(desc(diagnosticRuns.version))
    .limit(1)
    .get();
  const diagnosisCompleted = diagnosisRun ? (db.select({ value: count() }).from(attempts)
    .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, diagnosisRun.id))
    .get()?.value ?? 0) : 0;
  const difficultyRows = diagnosisRun ? db.select({
    part: trainingSessions.diagnosticPartNumber,
    difficulty: sessionItems.difficultySnapshot,
  })
    .from(sessionItems)
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, diagnosisRun.id))
    .orderBy(asc(trainingSessions.diagnosticPartNumber), asc(sessionItems.position))
    .all() : [];
  const difficultyPaths = [1, 2, 3].map((part) => ({
    part,
    values: difficultyRows
      .filter((row) => row.part === part && row.difficulty !== null)
      .map((row) => row.difficulty as number),
  }));
  const diagnosisReport = diagnosisRun?.status === "completed"
    ? parseInitialReport(diagnosisRun.reportSnapshot)
    : null;
  const summaryPeriods = [
    { label: "累计", metric: evidence.summary.cumulative },
    { label: "今日", metric: evidence.summary.today },
    { label: "本周", metric: evidence.summary.week },
  ];

  return (
    <main className="parentPage">
      <header className="parentHeader">
        <div>
          <p className="eyebrow">家长查看 · 阶段性记录</p>
          <h1>{child.displayName}的学习证据</h1>
          <p>这里记录孩子实际作答的题目与答案，用来安排下一步练习。</p>
        </div>
        <aside className="parentRecommendation" aria-labelledby="recommendation-heading">
          <p id="recommendation-heading">本周建议</p>
          <strong>{recommendation(evidence.summary.week.answered, evidence.summary.week.correct)}</strong>
        </aside>
      </header>

      {diagnosisRun && (
        <section className="diagnosisSummary" aria-labelledby="diagnosis-summary-heading">
          <div className="sectionHeading diagnosisSummaryHeading">
            <div>
              <p className="eyebrow">三部分数学体检</p>
              <h2 id="diagnosis-summary-heading">
                {diagnosisRun.status === "completed"
                  ? `初始诊断报告 · 第 ${diagnosisRun.version} 版 · 45/45`
                  : `诊断进行中 · ${diagnosisCompleted}/45`}
              </h2>
            </div>
            <p>{diagnosisRun.status === "completed" ? "报告已生成" : `当前第 ${diagnosisRun.currentPart} 部分`}</p>
          </div>
          <div className="parentDiagnosisRail" aria-label={`已完成 ${diagnosisCompleted} / 45`}>
            {[0, 1, 2].map((index) => (
              <span key={index}>
                <span style={{ width: `${Math.max(0, Math.min(15, diagnosisCompleted - index * 15)) / 15 * 100}%` }} />
              </span>
            ))}
          </div>
          {difficultyPaths.some(({ values }) => values.length > 0) && (
            <div className="difficultyPaths" aria-label="三部分实际难度路径">
              <strong>难度路径</strong>
              {difficultyPaths.map(({ part, values }) => values.length > 0 && (
                <p key={part} data-testid="diagnosis-difficulty-part">
                  <span>第 {part} 部分：</span>{values.join(" → ")}
                </p>
              ))}
            </div>
          )}
          {diagnosisReport && (
            <>
              <p className="provisionalNote">这些是暂定状态，会随之后的跨日练习更新。</p>
              <ul className="diagnosisDomainGrid">
                {diagnosisReport.domains.map((domain) => (
                  <li key={domain.domain} data-testid="diagnosis-domain-status">
                    <div>
                      <strong>{domainLabels[domain.domain]}</strong>
                      <span>{domain.evidenceCount} 道独立首答证据</span>
                    </div>
                    <span className="skillStatus" data-status={domain.status}>{statusLabels[domain.status]}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="evidenceSummary" aria-labelledby="summary-heading">
        <div className="summaryIntro">
          <p className="eyebrow">今日 / 本周 / 累计</p>
          <h2 id="summary-heading">首次作答证据</h2>
          <p>每道题只用最早一次提交计算答对率；订正前后的答案仍会分别保留。</p>
        </div>
        <dl className="summaryMetrics">
          {summaryPeriods.map(({ label, metric }) => (
            <div key={label}>
              <dt>{label}首次作答</dt>
              <dd>
                {metric.answered} 次
                <span>{label}首次答对率 {formatAccuracy(metric.accuracy)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="parentSection" aria-labelledby="skills-heading">
        <div className="sectionHeading">
          <h2 id="skills-heading">技能状态</h2>
          <p>状态只反映当前收集到的作答证据。</p>
        </div>
        {evidence.skills.length === 0 ? (
          <p className="emptyEvidence">完成训练后，这里会出现技能状态。</p>
        ) : (
          <ul className="skillEvidenceList">
            {evidence.skills.map((skill) => (
              <li key={skill.skillName}>
                <div>
                  <strong>{skill.skillName}</strong>
                  <span>{skill.evidenceCount} 条作答证据</span>
                </div>
                <span className="skillStatus" data-status={skill.status}>
                  {statusLabels[skill.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="parentSection" aria-labelledby="recent-heading">
        <div className="sectionHeading">
          <h2 id="recent-heading">最近作答</h2>
          <p>按提交时间倒序，最多显示 20 条。</p>
        </div>
        {evidence.recent.length === 0 ? (
          <p className="emptyEvidence">还没有作答证据。先让孩子完成今天的训练。</p>
        ) : (
          <div className="evidenceTableFrame">
            <table className="evidenceTable">
              <thead>
                <tr>
                  <th scope="col">题目</th>
                  <th scope="col">提交答案</th>
                  <th scope="col">结果</th>
                  <th scope="col">技能</th>
                  <th scope="col">时间</th>
                </tr>
              </thead>
              <tbody>
                {evidence.recent.map((attempt, index) => (
                  <tr key={`${attempt.submittedAt}-${index}`}>
                    <td data-label="题目">{attempt.stem}</td>
                    <td data-label="提交答案"><strong>{attempt.answerText}</strong></td>
                    <td data-label="结果">
                      <span className="attemptResult" data-correct={attempt.correct}>
                        {attempt.correct ? "已答对" : "未答对"}
                      </span>
                    </td>
                    <td data-label="技能">{attempt.skillName}</td>
                    <td data-label="时间"><time dateTime={new Date(attempt.submittedAt).toISOString()}>{formatSubmittedAt(attempt.submittedAt)}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
