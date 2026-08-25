import { asc, count, desc, eq } from "drizzle-orm";
import { AbilityMap } from "@/components/ability-map";
import { DosageSummary } from "@/components/dosage-summary";
import { ErrorSummary } from "@/components/error-summary";
import { ParentRetestButton } from "@/components/parent-retest-button";
import { PlanCalendar } from "@/components/plan-calendar";
import { PlanPreferencesForm } from "@/components/plan-preferences-form";
import { WeeklyReport } from "@/components/weekly-report";
import { getDatabase } from "@/db/client";
import { attempts, diagnosticRuns, sessionItems, trainingSessions, users } from "@/db/schema";
import type { InitialDiagnosisReport } from "@/domain/diagnosis/types";
import { requireRole } from "@/lib/auth/current-user";
import { getLearningState } from "@/services/parent/get-learning-state";
import { getPlanDashboard } from "@/services/parent/get-plan-dashboard";
import { getParentEvidence } from "@/services/training/get-parent-evidence";

const statusLabels = {
  undiagnosed: "尚未诊断",
  needs_support: "需要支持",
  learning: "正在学习",
  basic: "基础掌握",
  stable: "稳定保持",
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

type DifficultySnapshot = {
  part: number | null;
  position: number;
  difficulty: number;
  targetDifficulty: number;
};

function parseTargetDifficulty(value: string, actual: number): number {
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null && "targetDifficulty" in parsed
      && typeof parsed.targetDifficulty === "number") return parsed.targetDifficulty;
  } catch {
    // Legacy snapshots have no structured selection explanation.
  }
  return actual;
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
  const learningState = getLearningState(db, child.id);
  const planDashboard = getPlanDashboard(db, child.id);
  const diagnosisHistory = db.select().from(diagnosticRuns)
    .where(eq(diagnosticRuns.childId, child.id))
    .orderBy(desc(diagnosticRuns.version))
    .all();
  const currentDiagnosis = diagnosisHistory[0] ?? null;
  const completedDiagnosis = diagnosisHistory.find(({ status }) => status === "completed") ?? null;
  const currentCompleted = currentDiagnosis ? (db.select({ value: count() }).from(attempts)
    .innerJoin(sessionItems, eq(attempts.sessionItemId, sessionItems.id))
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, currentDiagnosis.id))
    .get()?.value ?? 0) : 0;
  const difficultyRows: DifficultySnapshot[] = completedDiagnosis ? db.select({
    part: trainingSessions.diagnosticPartNumber,
    position: sessionItems.position,
    difficulty: sessionItems.difficultySnapshot,
    metadata: sessionItems.selectionReasonSnapshot,
  })
    .from(sessionItems)
    .innerJoin(trainingSessions, eq(sessionItems.sessionId, trainingSessions.id))
    .where(eq(trainingSessions.diagnosticRunId, completedDiagnosis.id))
    .orderBy(asc(trainingSessions.diagnosticPartNumber), asc(sessionItems.position))
    .all()
    .map((row) => ({
      part: row.part,
      position: row.position,
      difficulty: row.difficulty,
      targetDifficulty: parseTargetDifficulty(row.metadata, row.difficulty),
    })) : [];
  const difficultyPaths = [1, 2, 3].map((part) => ({
    part,
    values: difficultyRows
      .filter((row) => row.part === part && row.difficulty !== null)
      .map((row) => row.difficulty as number),
  }));
  const difficultyFallbackRows = difficultyRows.filter((row) => row.targetDifficulty !== row.difficulty);
  const diagnosisReport = completedDiagnosis
    ? parseInitialReport(completedDiagnosis.reportSnapshot)
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

      {currentDiagnosis?.status === "in_progress" && (
        <section className="diagnosisSummary" aria-labelledby="diagnosis-current-heading">
          <div className="sectionHeading diagnosisSummaryHeading">
            <div>
              <p className="eyebrow">当前三部分数学体检</p>
              <h2 id="diagnosis-current-heading">
                {currentDiagnosis.version === 1
                  ? `诊断进行中 · ${currentCompleted}/45`
                  : `诊断进行中 · 第 ${currentDiagnosis.version} 版 · ${currentCompleted}/45`}
              </h2>
            </div>
            <p>当前第 {currentDiagnosis.currentPart} 部分</p>
          </div>
          <div className="parentDiagnosisRail" aria-label={`已完成 ${currentCompleted} / 45`}>
            {[0, 1, 2].map((index) => (
              <span key={index}>
                <span style={{ width: `${Math.max(0, Math.min(15, currentCompleted - index * 15)) / 15 * 100}%` }} />
              </span>
            ))}
          </div>
          <p className="provisionalNote">孩子可从首页继续第 {currentDiagnosis.version} 版诊断；旧报告仍保留在下方。</p>
        </section>
      )}

      {completedDiagnosis && (
        <section className="diagnosisSummary" aria-labelledby="diagnosis-report-heading">
          <div className="sectionHeading diagnosisSummaryHeading">
            <div>
              <p className="eyebrow">三部分数学体检</p>
              <h2 id="diagnosis-report-heading">
                {currentDiagnosis?.status === "in_progress" ? "最近完成报告" : "初始诊断报告"}
                {` · 第 ${completedDiagnosis.version} 版 · 45/45`}
              </h2>
            </div>
            <p>报告已生成</p>
          </div>
          <div className="parentDiagnosisRail" aria-label="已完成 45 / 45">
            {[0, 1, 2].map((index) => (
              <span key={index}><span style={{ width: "100%" }} /></span>
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
              {difficultyFallbackRows.length > 0 && <details className="difficultyFallbackDetails">
                <summary>{difficultyFallbackRows.length} 题使用了最近可用难度</summary>
                <div>
                  {difficultyFallbackRows.map((row) => (
                    <p key={`${row.part}-${row.position}`} className="difficultyFallback" data-testid="diagnosis-difficulty-fallback">
                      第 {row.part} 部分第 {row.position} 题：目标 {row.targetDifficulty} → 实际 {row.difficulty}
                      <span>同领域目标难度题不可用，按规则使用最近难度。</span>
                    </p>
                  ))}
                </div>
              </details>}
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
          {currentDiagnosis?.status === "completed" && (
            <ParentRetestButton expectedCompletedVersion={completedDiagnosis.version} />
          )}
        </section>
      )}

      {diagnosisHistory.length > 0 && (
        <section className="diagnosisHistory" aria-labelledby="diagnosis-history-heading">
          <div className="sectionHeading">
            <h2 id="diagnosis-history-heading">诊断版本记录</h2>
            <p>新版本不会覆盖旧报告。</p>
          </div>
          <ul>
            {diagnosisHistory.map((run) => (
              <li key={run.id}>
                <strong>第 {run.version} 版 · {run.status === "completed" ? "已完成" : "进行中"}</strong>
                <span>{run.status === "completed" ? "报告已保留" : `当前第 ${run.currentPart} 部分`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <AbilityMap abilities={learningState.abilityMap} />

      <section className="parentSection" aria-labelledby="plan-heading">
        <div className="sectionHeading"><h2 id="plan-heading">六周训练计划</h2><p>{planDashboard.plan ? `第 ${planDashboard.plan.version} 版 · 修订 ${planDashboard.plan.revision} · 第 ${planDashboard.plan.currentWeek} 周` : "完成诊断后生成"}</p></div>
        <PlanCalendar days={planDashboard.nextSevenDays} />
        <PlanPreferencesForm initial={planDashboard.preferences} />
      </section>
      <WeeklyReport report={planDashboard.weeklyReport} />

      <DosageSummary dosage={learningState.dosage} dueReviews={learningState.dueReviews} />

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

      <ErrorSummary summary={learningState.errorSummary} errors={learningState.errors} />

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
