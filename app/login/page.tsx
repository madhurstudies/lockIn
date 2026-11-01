"use client";
import { useState } from "react";
import Logo from "@/components/Logo";

export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: f.get("username"), password: f.get("password") }),
    });
    if (res.ok) return void (location.href = "/");
    setError((await res.json().catch(() => ({}))).error ?? "Something went wrong");
    setBusy(false);
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1><Logo size={32} /> Lock In</h1>
      <div className="group">
        <input name="username" placeholder="Username" autoComplete="username" autoCapitalize="none" autoCorrect="off" required aria-label="Username" />
        <input name="password" type="password" placeholder="Password" autoComplete="current-password" required aria-label="Password" />
      </div>
      <p className="error" role="alert">{error}</p>
      <button className="primary" disabled={busy}>Sign in</button>
    </form>
  );
}
