import { eq } from "drizzle-orm";
import { getDatabase } from "@/db/client";
import { users } from "@/db/schema";
import { requireRole } from "@/lib/auth/current-user";
import { getParentEvidence } from "@/services/training/get-parent-evidence";

const statusLabels = {
  needs_support: "需要支持",
  learning: "正在学习",
  basic: "基础掌握",
} as const;

function recommendation(answered: number, correct: number) {
  if (answered === 0) return "先让孩子完成今天的训练";
  if (correct < answered) return "本周先看错题原因，不额外加量";
  return "保持当前训练节奏";
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
  const accuracy = evidence.summary.accuracy === null
    ? "暂无"
    : `${Math.round(evidence.summary.accuracy * 100)}%`;

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
          <strong>{recommendation(evidence.summary.answered, evidence.summary.correct)}</strong>
        </aside>
      </header>

      <section className="evidenceSummary" aria-labelledby="summary-heading">
        <div className="summaryIntro">
          <p className="eyebrow">今日 / 累计</p>
          <h2 id="summary-heading">首次作答证据</h2>
          <p>每次提交都计入，订正前后的答案会分别保留。</p>
        </div>
        <dl className="summaryMetrics">
          <div>
            <dt>累计作答</dt>
            <dd>{evidence.summary.answered} 次</dd>
          </div>
          <div>
            <dt>累计答对率</dt>
            <dd>{accuracy}</dd>
          </div>
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
