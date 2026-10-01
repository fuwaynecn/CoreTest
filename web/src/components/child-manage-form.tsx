"use client";

import { useState } from "react";

type ChildManageFormProps = {
  childId: string;
  initial: { displayName: string; grade: number | null };
  refresh?: () => void;
};

const grades = [
  [1, "一年级"], [2, "二年级"], [3, "三年级"],
  [4, "四年级"], [5, "五年级"], [6, "六年级"],
] as const;

export default function ChildManageForm({
  childId,
  initial,
  refresh = () => window.location.reload(),
}: ChildManageFormProps) {
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [grade, setGrade] = useState(String(initial.grade ?? 1));
  const [newCredential, setNewCredential] = useState("");

  const [infoError, setInfoError] = useState("");
  const [infoSuccess, setInfoSuccess] = useState("");
  const [infoPending, setInfoPending] = useState(false);

  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  async function saveInfo(event: React.FormEvent) {
    event.preventDefault();
    setInfoError("");
    setInfoSuccess("");
    setInfoPending(true);
    try {
      const response = await fetch(`/api/parent/children/${childId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, grade: Number(grade) }),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInfoError(typeof data === "object" && data !== null && "error" in data
          ? String(data.error) : "保存失败，请重试");
        return;
      }
      setInfoSuccess("资料已保存");
      refresh();
    } catch {
      setInfoError("网络连接失败，请检查网络后重试");
    } finally {
      setInfoPending(false);
    }
  }

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    setPasswordPending(true);
    try {
      const response = await fetch(`/api/parent/children/${childId}/reset-password`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ credential: newCredential }),
      });
      const data: unknown = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPasswordError(typeof data === "object" && data !== null && "error" in data
          ? String(data.error) : "重置失败，请重试");
        return;
      }
      setPasswordSuccess("密码已重置");
      setNewCredential("");
      refresh();
    } catch {
      setPasswordError("网络连接失败，请检查网络后重试");
    } finally {
      setPasswordPending(false);
    }
  }

  return (
    <section className="parentSection childManageSection" aria-labelledby="child-manage-heading">
      <div className="sectionHeading">
        <h2 id="child-manage-heading">孩子管理</h2>
        <p>修改孩子姓名、年级或重置登录密码。</p>
      </div>
      <form className="childManageForm" onSubmit={saveInfo}>
        <fieldset>
          <legend>修改资料</legend>
          <label>
            孩子姓名
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              minLength={1}
              maxLength={32}
              autoComplete="name"
            />
          </label>
          <label>
            年级
            <select value={grade} onChange={(event) => setGrade(event.target.value)}>
              {grades.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button type="submit" disabled={infoPending}>
            {infoPending ? "保存中..." : "保存资料"}
          </button>
          {infoSuccess && <p role="status" className="formSuccess">{infoSuccess}</p>}
          {infoError && <p role="alert" className="formError">{infoError}</p>}
        </fieldset>
      </form>
      <form className="childManageForm" onSubmit={resetPassword}>
        <fieldset>
          <legend>重置密码</legend>
          <label>
            新密码
            <input
              type="password"
              value={newCredential}
              onChange={(event) => setNewCredential(event.target.value)}
              required
              minLength={4}
              maxLength={64}
              autoComplete="new-password"
            />
          </label>
          <button type="submit" disabled={passwordPending}>
            {passwordPending ? "重置中..." : "重置密码"}
          </button>
          {passwordSuccess && <p role="status" className="formSuccess">{passwordSuccess}</p>}
          {passwordError && <p role="alert" className="formError">{passwordError}</p>}
        </fieldset>
      </form>
    </section>
  );
}