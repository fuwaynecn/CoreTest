"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuestionBankRow } from "@/services/parent/question-bank";

type Props = { row: QuestionBankRow; skillOptions?: readonly { id: string; name: string }[] };

export function QuestionBankEditor({ row, skillOptions = [{ id: row.skillId, name: row.skillName }] }: Props) {
  const router = useRouter();
  const [stem, setStem] = useState(row.stem);
  const [answer, setAnswer] = useState(String(row.answerSpec.value));
  const [unit, setUnit] = useState(row.answerSpec.kind === "number" ? row.answerSpec.unit ?? "" : "");
  const [explanation, setExplanation] = useState(row.explanation);
  const [skillId, setSkillId] = useState(row.skillId);
  const [difficulty, setDifficulty] = useState(String(row.difficulty));
  const [active, setActive] = useState(row.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState(false);
  const [saved, setSaved] = useState(false);
  const errorId = `question-bank-error-${row.id}`;

  function clearError() {
    setError("");
    setFieldError(false);
  }

  async function save() {
    setSaving(true);
    clearError();
    setSaved(false);
    const answerSpec = row.answerSpec.kind === "choice"
      ? { kind: "choice" as const, value: answer as "A" | "B" | "C" | "D" }
      : { kind: "number" as const, value: Number(answer), tolerance: row.answerSpec.tolerance, unit: unit.trim() || null };
    try {
      const response = await fetch(`/api/parent/questions/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stem, answerSpec, explanation, skillId, difficulty: Number(difficulty), active }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
        setFieldError(body?.error?.code === "invalid_question");
        setError(body?.error?.message ?? "保存失败，请稍后重试");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFieldError(false);
      setError("保存失败，请检查网络后重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="questionBankEditor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>题干<textarea value={stem} onChange={(event) => { setStem(event.target.value); clearError(); }} aria-invalid={fieldError || undefined} aria-describedby={fieldError ? errorId : undefined} required /></label>
      <label>正确答案
        {row.answerSpec.kind === "choice" ? (
          <select value={answer} onChange={(event) => { setAnswer(event.target.value); clearError(); }} aria-invalid={fieldError || undefined} aria-describedby={fieldError ? errorId : undefined}>
            {(["A", "B", "C", "D"] as const).map((option) => <option key={option}>{option}</option>)}
          </select>
        ) : <input type="number" step="any" value={answer} onChange={(event) => { setAnswer(event.target.value); clearError(); }} aria-invalid={fieldError || undefined} aria-describedby={fieldError ? errorId : undefined} required />}
      </label>
      {row.answerSpec.kind === "number" && <label>可选单位<input value={unit} onChange={(event) => { setUnit(event.target.value); clearError(); }} /></label>}
      <label>解析<textarea value={explanation} onChange={(event) => { setExplanation(event.target.value); clearError(); }} required /></label>
      <label>知识点<select value={skillId} onChange={(event) => { setSkillId(event.target.value); clearError(); }}>{skillOptions.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      <label>难度<select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); clearError(); }}>{[1, 2, 3, 4].map((level) => <option key={level} value={level}>{level} 级</option>)}</select></label>
      <label className="questionBankToggle"><input type="checkbox" checked={active} onChange={(event) => { setActive(event.target.checked); clearError(); }} />启用状态</label>
      {error && <p className="questionBankError" id={fieldError ? errorId : undefined} role="alert">{error}</p>}
      <div className="questionBankActions"><button type="submit" disabled={saving}>{saving ? "保存中…" : "保存"}</button>{saved && <span className="questionBankSaved">已保存</span>}</div>
    </form>
  );
}
