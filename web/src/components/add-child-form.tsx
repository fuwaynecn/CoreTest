"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddChildForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [loginName, setLoginName] = useState("");
  const [grade, setGrade] = useState("1");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setPending(true);

    try {
      const response = await fetch("/api/parent/children", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          displayName,
          loginName,
          grade: Number(grade),
          credential,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(data.error ?? "添加失败，请重试");
        return;
      }

      setSuccess("孩子添加成功");
      setDisplayName("");
      setLoginName("");
      setGrade("1");
      setCredential("");
      router.refresh();
    } catch {
      setError("网络连接失败，请检查网络后重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="addChildForm" onSubmit={handleSubmit}>
      <h2>添加孩子</h2>
      <label>
        孩子姓名
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          minLength={1}
          maxLength={50}
          autoComplete="name"
        />
      </label>
      <label>
        登录名
        <input
          type="text"
          value={loginName}
          onChange={(e) => setLoginName(e.target.value)}
          required
          minLength={3}
          maxLength={32}
          pattern="[a-zA-Z0-9_]+"
          autoComplete="username"
        />
      </label>
      <label>
        年级
        <select value={grade} onChange={(e) => setGrade(e.target.value)}>
          <option value="1">一年级</option>
          <option value="2">二年级</option>
          <option value="3">三年级</option>
          <option value="4">四年级</option>
          <option value="5">五年级</option>
          <option value="6">六年级</option>
        </select>
      </label>
      <label>
        登录密码
        <input
          type="password"
          value={credential}
          onChange={(e) => setCredential(e.target.value)}
          required
          minLength={4}
          maxLength={64}
          autoComplete="new-password"
        />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "添加中..." : "添加孩子"}
      </button>
      {success && <p role="status" className="formSuccess">{success}</p>}
      {error && <p role="alert" className="formError">{error}</p>}
    </form>
  );
}
