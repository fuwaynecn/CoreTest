import type { DosageView, DueReviewView } from "@/services/parent/get-learning-state";

const reasonLabels: Record<DosageView["reasonCode"], string> = {
  advance: "最近两次跨日训练达到 90%，提示和到期复习条件也满足，等级上调。",
  hold: "最近证据处于保持区间，维持当前等级和目标量。",
  support: "准确率或到期复习需要支持：降低或保持难度，不增加题量。",
  insufficient_evidence: "跨日证据还不足两次，先维持当前安排。",
};

const trackLabels = { computation: "算力", equation: "方程" } as const;

function DoseCard({ dose }: { dose: DosageView }) {
  return (
    <article className="doseCard" data-track={dose.track}>
      <div>
        <p>{trackLabels[dose.track]}剂量</p>
        <h3>{trackLabels[dose.track]} {dose.level} 级</h3>
      </div>
      <dl>
        <div><dt>每次</dt><dd>{dose.sessionMin}–{dose.sessionMax} 题</dd></div>
        <div><dt>本次目标</dt><dd>{dose.sessionTarget} 题</dd></div>
        <div><dt>每周</dt><dd>{dose.weeklyTarget} 题</dd></div>
        <div><dt>同结构上限</dt><dd>6 题</dd></div>
      </dl>
      <p>{reasonLabels[dose.reasonCode]}</p>
      {dose.parentInterventionSuggested && <strong className="interventionNote">达到同结构上限，建议家长一起看方法，不继续加量。</strong>}
    </article>
  );
}

export function DosageSummary({
  dosage,
  dueReviews,
}: {
  dosage: { computation: DosageView | null; equation: DosageView | null };
  dueReviews: DueReviewView[];
}) {
  const doses = [dosage.computation, dosage.equation].filter((item): item is DosageView => item !== null);
  return (
    <section className="learningStateSection dosageSection" aria-labelledby="dosage-heading">
      <div className="sectionHeading">
        <div>
          <p className="eyebrow">复习与训练量</p>
          <h2 id="dosage-heading">今天先复习，再按当前剂量练习</h2>
        </div>
        <p>低准确率只调整支持和难度，不用增加题量。</p>
      </div>
      <div className="reviewDoseGrid">
        <article className="dueReviewCard">
          <h3>到期复习</h3>
          {dueReviews.length === 0 ? <p>今天没有到期或逾期复习。</p> : (
            <ul>
              {dueReviews.map((review) => (
                <li key={review.skillId}>
                  <div><strong>{review.skillName}</strong><span>复习级别 {review.level}</span></div>
                  <time dateTime={review.dueOn}>{review.dueOn} · {review.overdueDays === 0 ? "今天到期" : `已逾期 ${review.overdueDays} 天`}</time>
                </li>
              ))}
            </ul>
          )}
        </article>
        <div className="doseCards">
          {doses.length > 0 ? doses.map((dose) => <DoseCard key={dose.track} dose={dose} />) : (
            <p className="emptyEvidence">完成正式训练后，这里会显示算力和方程剂量。</p>
          )}
        </div>
      </div>
    </section>
  );
}
