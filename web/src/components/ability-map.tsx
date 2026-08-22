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

function hintLabel(evidence: AbilityView["evidence"][number]) {
  if (evidence.hintLevel === null) return "提示情况未知";
  if (evidence.independent) return "独立完成";
  return `使用提示（级别 ${evidence.hintLevel}）`;
}

function EvidenceList({ evidence, basisIds }: {
  evidence: AbilityView["evidence"];
  basisIds: Set<string>;
}) {
  return <ul className="masteryEvidenceList">
    {evidence.map((item) => (
      <li id={`mastery-evidence-${item.id}`} key={item.id} tabIndex={-1}>
        <strong>{item.occurredOn} · {item.firstAttemptCorrect ? "首答正确" : "首答未正确"}</strong>
        {basisIds.has(item.id) && <b className="masteryBasisMark">本次状态依据</b>}
        <span>{item.stem}</span>
        <span>首答：{item.firstAnswer ?? "未记录"} · {hintLabel(item)}</span>
        <small>{durationLabel(item.activeDurationMs)}</small>
      </li>
    ))}
  </ul>;
}

function AbilityCard({ ability }: { ability: AbilityView }) {
  const basisIds = new Set(ability.supportingEvidenceIds);
  const basisEvidence = ability.evidence.filter((item) => basisIds.has(item.id));
  const cursorEvidence = ability.evidence.find((item) => item.id === ability.evidenceCursor);
  const anchorEvidence = cursorEvidence ?? basisEvidence.at(-1) ?? ability.evidence.at(-1);
  const historicalEvidence = ability.evidence.filter((item) => !basisIds.has(item.id));
  const cursorIsHistorical = cursorEvidence !== undefined && !basisIds.has(cursorEvidence.id);
  return <li>
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
      {basisEvidence.length > 0
        ? <EvidenceList evidence={basisEvidence} basisIds={basisIds} />
        : <p>当前状态没有可下钻的直接依据；可查看最近证据游标。</p>}
      {historicalEvidence.length > 0 && <details className="masteryHistory" open={cursorIsHistorical}>
        <summary>查看其余 {historicalEvidence.length} 条历史证据</summary>
        <EvidenceList evidence={historicalEvidence} basisIds={basisIds} />
      </details>}
    </div>
    {anchorEvidence && <a className="evidenceAnchor" href={`#mastery-evidence-${anchorEvidence.id}`}>
      查看 {anchorEvidence.occurredOn} 的状态依据
    </a>}
  </li>;
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
          const waitingWithoutEvidence = value === "undiagnosed"
            ? matching.filter((ability) => ability.evidence.length === 0)
            : [];
          const displayed = value === "undiagnosed"
            ? matching.filter((ability) => ability.evidence.length > 0)
            : matching;
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
                {displayed.length > 0 && <ul className="masterySkills">
                  {displayed.map((ability) => <AbilityCard key={ability.skillId} ability={ability} />)}
                </ul>}
                {waitingWithoutEvidence.length > 0 && <details className="masteryWaitingSkills">
                  <summary>{waitingWithoutEvidence.length} 项尚无题目证据</summary>
                  <p>{waitingWithoutEvidence.map((ability) => ability.skillName).join("、")}</p>
                </details>}
                {matching.length === 0 && <p className="masteryEmptyState">当前没有能力点处于这个状态。</p>}
              </details>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
