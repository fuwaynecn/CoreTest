"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuestionBankRow } from "@/services/parent/question-bank";

type Props = { row: QuestionBankRow; skillOptions?: readonly { id: string; name: string }[] };
type EditorField = "stem" | "answer" | "unit" | "explanation" | "skill" | "difficulty" | "form";
type ServerReason = { code?: string; field?: string };

const reasonMessages: Record<string, string> = {
  invalid_answer_spec: "答案格式无效",
  answer_mode_mismatch: "答案类型与题型不匹配",
  incorrect_number_answer: "答案与题干不匹配",
  incorrect_equation_answer: "答案与方程不匹配",
  incorrect_choice_answer: "答案选项不正确",
  missing_unit: "请填写单位",
  unit_mismatch: "单位与题目要求不一致",
  unknown_skill: "知识点不存在",
  unsupported_number_pattern: "题干格式不受支持",
  invalid_number_pattern: "题干格式无效",
  unsolvable_equation: "题干不是可解的方程",
  invalid_choice_options: "题干选项格式无效",
  duplicate_choice_option: "题干选项不能重复",
  unsupported_choice_pattern: "题干选项题型不受支持",
  invalid_choice_pattern: "题干选项格式无效",
  invalid_request: "参数无效",
  invalid_question: "题库题目参数无效",
};

function fieldOf(value: string | undefined): EditorField {
  return value === "stem" || value === "answer" || value === "unit"
    || value === "explanation" || value === "skill" || value === "difficulty"
    ? value : "form";
}

function reasonMessage(code: string) {
  return reasonMessages[code] ?? "题库题目参数无效";
}

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
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<EditorField, string[]>>>({});
  const [hasStructuredReasons, setHasStructuredReasons] = useState(false);
  const [saved, setSaved] = useState(false);
  const errorId = `question-bank-error-${row.id}`;

  function clearError() {
    setError("");
    setFieldErrors({});
    setHasStructuredReasons(false);
  }

  function fieldMessage(field: EditorField) {
    return fieldErrors[field]?.join("；") ?? "";
  }

  function fieldErrorId(field: EditorField) {
    return `${errorId}-${field}`;
  }

  function fieldDescribedBy(field: EditorField) {
    if (!fieldMessage(field)) return undefined;
    return hasStructuredReasons ? `${fieldErrorId(field)} ${errorId}` : errorId;
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
        const body = await response.json().catch(() => null) as { error?: { code?: string; message?: string; reasons?: ServerReason[] } } | null;
        const reasons = body?.error?.reasons?.length
          ? body.error.reasons
          : body?.error?.code === "invalid_question"
            ? [{ field: "stem", code: body.error.message }, { field: "answer", code: body.error.message }]
            : [];
        const nextFieldErrors: Partial<Record<EditorField, string[]>> = {};
        for (const reason of reasons) {
          const field = fieldOf(reason.field);
          const message = body?.error?.reasons?.length ? reasonMessage(reason.code ?? "invalid_question") : reason.code ?? "题库题目参数无效";
          nextFieldErrors[field] = [...(nextFieldErrors[field] ?? []), message];
        }
        setFieldErrors(nextFieldErrors);
        setHasStructuredReasons(Boolean(body?.error?.reasons?.length));
        setError(body?.error?.message ?? "保存失败，请稍后重试");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setFieldErrors({});
      setError("保存失败，请检查网络后重试");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="questionBankEditor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>题干<textarea value={stem} onChange={(event) => { setStem(event.target.value); clearError(); }} aria-invalid={fieldMessage("stem") ? "true" : undefined} aria-describedby={fieldDescribedBy("stem")} required /></label>
      {fieldMessage("stem") && <span id={fieldErrorId("stem")} className="questionBankFieldError">{fieldMessage("stem")}</span>}
      <label>正确答案
        {row.answerSpec.kind === "choice" ? (
          <select value={answer} onChange={(event) => { setAnswer(event.target.value); clearError(); }} aria-invalid={fieldMessage("answer") ? "true" : undefined} aria-describedby={fieldDescribedBy("answer")}>
            {(["A", "B", "C", "D"] as const).map((option) => <option key={option}>{option}</option>)}
          </select>
        ) : <input type="number" step="any" value={answer} onChange={(event) => { setAnswer(event.target.value); clearError(); }} aria-invalid={fieldMessage("answer") ? "true" : undefined} aria-describedby={fieldDescribedBy("answer")} required />}
      </label>
      {fieldMessage("answer") && <span id={fieldErrorId("answer")} className="questionBankFieldError">{fieldMessage("answer")}</span>}
      {row.answerSpec.kind === "number" && <><label>可选单位<input value={unit} onChange={(event) => { setUnit(event.target.value); clearError(); }} aria-invalid={fieldMessage("unit") ? "true" : undefined} aria-describedby={fieldDescribedBy("unit")} /></label>{fieldMessage("unit") && <span id={fieldErrorId("unit")} className="questionBankFieldError">{fieldMessage("unit")}</span>}</>}
      <label>解析<textarea value={explanation} onChange={(event) => { setExplanation(event.target.value); clearError(); }} aria-invalid={fieldMessage("explanation") ? "true" : undefined} aria-describedby={fieldDescribedBy("explanation")} required /></label>
      {fieldMessage("explanation") && <span id={fieldErrorId("explanation")} className="questionBankFieldError">{fieldMessage("explanation")}</span>}
      <label>知识点<select value={skillId} onChange={(event) => { setSkillId(event.target.value); clearError(); }} aria-invalid={fieldMessage("skill") ? "true" : undefined} aria-describedby={fieldDescribedBy("skill")}>{skillOptions.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
      {fieldMessage("skill") && <span id={fieldErrorId("skill")} className="questionBankFieldError">{fieldMessage("skill")}</span>}
      <label>难度<select value={difficulty} onChange={(event) => { setDifficulty(event.target.value); clearError(); }} aria-invalid={fieldMessage("difficulty") ? "true" : undefined} aria-describedby={fieldDescribedBy("difficulty")}>{[1, 2, 3, 4].map((level) => <option key={level} value={level}>{level} 级</option>)}</select></label>
      {fieldMessage("difficulty") && <span id={fieldErrorId("difficulty")} className="questionBankFieldError">{fieldMessage("difficulty")}</span>}
      <label className="questionBankToggle"><input type="checkbox" checked={active} onChange={(event) => { setActive(event.target.checked); clearError(); }} />启用状态</label>
      {error && <p className="questionBankError" id={errorId} role="alert">{error}</p>}
      <div className="questionBankActions"><button type="submit" disabled={saving}>{saving ? "保存中…" : "保存"}</button>{saved && <span className="questionBankSaved">已保存</span>}</div>
    </form>
  );
}
