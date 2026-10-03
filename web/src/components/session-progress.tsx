type SessionProgressProps = {
  completed: number;
  total: number;
};

export function SessionProgress({ completed, total }: SessionProgressProps) {
  const remaining = Math.max(0, total - completed);
  return <p className="sessionProgress">已做 {completed} 题 / 剩余 {remaining} 题</p>;
}
