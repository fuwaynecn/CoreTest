import Link from "next/link";
import { redirect } from "next/navigation";
import { DiagnosisAnswerForm } from "@/components/diagnosis-answer-form";
import { DiagnosisProgress } from "@/components/diagnosis-progress";
import { QuestionCard } from "@/components/question-card";
import { getDatabase } from "@/db/client";
import { requireRole } from "@/lib/auth/current-user";
import { getDiagnosisView } from "@/services/diagnosis/diagnosis-service";

export default async function DiagnosisRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const child = await requireRole("child");
  const { runId } = await params;
  const diagnosis = getDiagnosisView(getDatabase(), child.id);
  if (diagnosis.runId !== runId) redirect(`/child/diagnosis/${diagnosis.runId}`);

  if (diagnosis.status === "completed") {
    return (
      <main className="trainingPage diagnosisPage completionCard">
        <p className="eyebrow">初始诊断 · 第 {diagnosis.version} 版</p>
        <h1>三部分都完成了</h1>
        <p>你认真完成了 45 道题。家长端现在可以查看暂定报告。</p>
        <Link className="primaryButton" href="/child">回到首页</Link>
      </main>
    );
  }

  if (!diagnosis.currentItem) throw new Error("Diagnosis item is missing");
  const completedInPart = diagnosis.completedSlots - (diagnosis.currentPart - 1) * 15;

  return (
    <main className="trainingPage diagnosisPage">
      <DiagnosisProgress part={diagnosis.currentPart} completedInPart={completedInPart} totalInPart={15} />
      <p className="diagnosisNote">不用赶时间。读清题目，按自己的理解作答。</p>
      <QuestionCard stem={diagnosis.currentItem.stem} />
      <DiagnosisAnswerForm sessionItemId={diagnosis.currentItem.id} runId={diagnosis.runId} />
    </main>
  );
}
