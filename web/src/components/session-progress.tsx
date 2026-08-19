type SessionProgressProps = {
  current: number;
  total?: number;
};

export function SessionProgress({ current, total = 3 }: SessionProgressProps) {
  return <p className="sessionProgress">第 {current} 题，共 {total} 题</p>;
}
