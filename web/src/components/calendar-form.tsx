"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type CalendarFormProps = {
  initial: {
    schoolYear: string;
    semester1Start: string;
    semester2Start: string;
  };
};

export function CalendarForm({ initial }: CalendarFormProps) {
  const router = useRouter();
  const [semester1Start, setSemester1Start] = useState(initial.semester1Start);
  const [semester2Start, setSemester2Start] = useState(initial.semester2Start);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/parent/calendar", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schoolYear: initial.schoolYear,
          semester1Start,
          semester2Start,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        setError(payload.error ?? "保存失败，请刷新后重试");
        return;
      }

      setSuccess("校历已保存");
      router.refresh();
    } catch {
      setError("网络连接失败，请检查网络后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="calendarForm" onSubmit={handleSubmit}>
      <fieldset disabled={pending}>
        <label>
          学年
          <input
            type="text"
            value={initial.schoolYear}
            readOnly
            aria-readonly="true"
          />
        </label>
        <label>
          上学期开学日
          <input
            type="date"
            value={semester1Start}
            onChange={(event) => {
              setSemester1Start(event.target.value);
              setError("");
              setSuccess("");
            }}
          />
        </label>
        <label>
          下学期开学日
          <input
            type="date"
            value={semester2Start}
            onChange={(event) => {
              setSemester2Start(event.target.value);
              setError("");
              setSuccess("");
            }}
          />
        </label>
        <button type="submit" disabled={pending}>
          保存校历
        </button>
        {error && <p role="alert">{error}</p>}
        {success && <p className="formSuccess">{success}</p>}
      </fieldset>
    </form>
  );
}
