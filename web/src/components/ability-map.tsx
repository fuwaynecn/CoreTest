import type { AbilityView } from "@/services/parent/get-learning-state";

const states = [
  ["undiagnosed", "尚未诊断", "等待正式证据"],
  ["needs_support", "需要支持", "低于 50% 起点或跨日复习连续失误"],
  ["learning", "正在学习", "正在积累跨日、跨模板证据"],
  ["basic", "基础掌握", "达到 80% 门槛，等待长期复习检验"],
  ["stable", "稳定保持", "通过至少 7 天间隔与跨结构检验"],
] as const;

const domainLabels: Record<string, string> = {
  number_operations: "数与运算",
  equation_algebra: "方程与代数",
  geometry_space: "图形与空间",
  data_statistics: "数据与统计",
  application_modeling: "应用与建模",
  thinking_habits: "数学思维与习惯",
};

function durationLabel(value: number | null) {
  if (value === null) return "活跃作答用时未记录";
  if (value < 60_000) return `活跃作答约 ${Math.round(value / 1_000)} 秒（仅作上下文）`;
  return `活跃作答约 ${Math.round(value / 60_000)} 分钟（仅作上下文）`;
}

export function AbilityMap({ abilities }: { abilities: AbilityView[] }) {
  return (
    <section className="learningStateSection abilityMap" aria-labelledby="ability-map-heading">
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">证据阶梯</p>
          <h2 id="ability-map-heading">六领域能力地图</h2>
        </div>
        <p>状态由正式首答、提示与跨日复习推导，家长不能直接改写。</p>
      </div>

      <ol className="masteryLadder" aria-label="五级能力状态">
        {states.map(([value, label, threshold], index) => {
          const matching = abilities.filter((ability) => ability.status === value);
          return (
            <li key={value} data-status={value}>
              <details className="masteryStateGroup">
                <summary>
                  <span className="masteryStep">
                    <span aria-hidden="true">{index + 1}</span>
                    <span><strong>{label}</strong><small>{threshold}</small></span>
                    <em>{matching.length} 项</em>
                  </span>
                </summary>
                {matching.length > 0 ? <ul className="masterySkills">
                  {matching.map((ability) => (
                    <li key={ability.skillId}>
                      <div className="masterySkillHeading">
                        <div>
                          <span>{domainLabels[ability.domain] ?? ability.domain}</span>
                          <strong>{ability.skillName}</strong>
                        </div>
                        <b>{ability.evidenceCount} 条</b>
                      </div>
                      <div className="masteryWhy">
                        <strong>为什么是这个状态</strong>
                        <p>{ability.reason}</p>
                        {ability.updatedOn && <p>状态更新：{ability.updatedOn}</p>}
                        {ability.evidence.length > 0 ? (
                          <ul className="masteryEvidenceList">
                            {ability.evidence.map((evidence) => (
                              <li id={`mastery-evidence-${evidence.id}`} key={evidence.id} tabIndex={-1}>
                                <strong>{evidence.occurredOn} · {evidence.firstAttemptCorrect ? "首答正确" : "首答未正确"}</strong>
                                <span>{evidence.stem}</span>
                                <span>首答：{evidence.firstAnswer ?? "未记录"} · {evidence.independent ? "独立完成" : `使用提示（级别 ${evidence.hintLevel ?? "未知"}）`}</span>
                                <small>{durationLabel(evidence.activeDurationMs)}</small>
                              </li>
                            ))}
                          </ul>
                        ) : <p>当前没有可下钻的历史首答。</p>}
                      </div>
                      {ability.evidence[0] && (
                        <a className="evidenceAnchor" href={`#mastery-evidence-${ability.evidence[0].id}`}>
                          查看 {ability.evidence[0].occurredOn} 的原始证据
                        </a>
                      )}
                    </li>
                  ))}
                </ul> : <p className="masteryEmptyState">当前没有能力点处于这个状态。</p>}
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
