type DiagnosisProgressProps = {
  part: 1 | 2 | 3;
  completedInPart: number;
  totalInPart: 15;
};

export function DiagnosisProgress({ part, completedInPart, totalInPart }: DiagnosisProgressProps) {
  const completed = (part - 1) * totalInPart + completedInPart;

  return (
    <section className="diagnosisProgress" aria-label="诊断进度">
      <div className="diagnosisProgressCopy">
        <strong>第 {part} 部分，共 3 部分</strong>
        <span>本部分 {completedInPart} / {totalInPart}</span>
      </div>
      <div
        className="diagnosisRail"
        role="progressbar"
        aria-label={`初始诊断已完成 ${completed} / 45`}
        aria-valuemin={0}
        aria-valuemax={45}
        aria-valuenow={completed}
      >
        {[1, 2, 3].map((partNumber) => {
          const filled = partNumber < part
            ? 100
            : partNumber === part
              ? (completedInPart / totalInPart) * 100
              : 0;
          return (
            <span className="diagnosisRailSegment" key={partNumber} aria-hidden="true">
              <span style={{ width: `${filled}%` }} />
            </span>
          );
        })}
      </div>
    </section>
  );
}
