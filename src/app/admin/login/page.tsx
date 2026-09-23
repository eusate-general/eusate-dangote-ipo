"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
        router.refresh();
        return;
      }
      setError(
        res.status === 429
          ? "Too many attempts. Wait a few minutes and try again."
          : res.status === 503
            ? "Admin login is not configured yet (ADMIN_PASSWORD is unset)."
            : "Wrong password.",
      );
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-4">
      <h1 className="text-lg font-semibold">Admin</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-base"
        />
        {error && (
          <p role="alert" className="text-sm text-warn">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="w-full rounded-xl border border-accent bg-accent-soft px-4 py-2.5 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
