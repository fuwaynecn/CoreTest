import Link from "next/link";

export default function Home() {
  return (
    <main className="landing">
      <p className="eyebrow">家庭数学训练</p>
      <h1>每天认真一点，数学更稳一点</h1>
      <p>用大约三十分钟完成审题、计算、订正和回顾。</p>
      <Link className="primaryButton" href="/login">进入系统</Link>
    </main>
  );
}
