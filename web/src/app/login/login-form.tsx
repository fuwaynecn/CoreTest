"use client";

import { FormEvent, useState } from "react";

type Role = "parent" | "child";

export default function LoginForm() {
  const [role, setRole] = useState<Role>("child");
  const [credential, setCredential] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function selectRole(nextRole: Role) {
    setRole(nextRole);
    setCredential("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role, credential }),
      });
      const result = await response.json() as { error?: string; redirectTo?: string };

      if (!response.ok || !result.redirectTo) {
        setError(result.error ?? "身份或凭据不正确");
        return;
      }

      window.location.assign(result.redirectTo);
    } catch {
      setError("暂时无法登录，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const credentialLabel = role === "child" ? "PIN" : "家长密码";

  return (
    <form className="loginForm" onSubmit={submit}>
      <div className="roleCards" aria-label="登录身份">
        <button
          type="button"
          className="roleCard"
          aria-pressed={role === "child"}
          onClick={() => selectRole("child")}
        >
          <strong>我是孩子</strong>
          <span>使用 PIN 登录</span>
        </button>
        <button
          type="button"
          className="roleCard"
          aria-pressed={role === "parent"}
          onClick={() => selectRole("parent")}
        >
          <strong>我是家长</strong>
          <span>使用家长密码登录</span>
        </button>
      </div>

      <label className="credentialField">
        <span>{credentialLabel}</span>
        <input
          required
          minLength={4}
          maxLength={128}
          type="password"
          inputMode={role === "child" ? "numeric" : undefined}
          autoComplete="current-password"
          value={credential}
          onChange={(event) => setCredential(event.target.value)}
        />
      </label>

      {error ? <p className="loginError" role="alert">{error}</p> : null}
      <button className="primaryButton loginSubmit" type="submit" disabled={submitting}>
        {submitting ? "正在登录…" : "登录"}
      </button>
    </form>
  );
}
