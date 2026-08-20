import { redirect } from "next/navigation";
import { getDatabase } from "@/db/client";
import { requireRole } from "@/lib/auth/current-user";
import { getOrCreateDiagnosis } from "@/services/diagnosis/diagnosis-service";

export default async function DiagnosisStartPage() {
  const child = await requireRole("child");
  const diagnosis = getOrCreateDiagnosis(getDatabase(), child.id);
  redirect(`/child/diagnosis/${diagnosis.runId}`);
}
