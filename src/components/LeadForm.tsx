"use client";

import { useState, type FormEvent } from "react";
import { track } from "@/lib/client/track";

export function LeadForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!consent) return;
    setState("busy");
    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, consent, context: "homepage_card" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      track("eusate_cta_click", { placement: "lead_form" });
      setState("done");
    } catch {
      setState("error");
    }
  };

  if (state === "done") {
    return <p className="mt-3 text-sm text-ink">Thanks — the Eusate team will reach out.</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="lead-email" className="sr-only">
          Your email
        </label>
        <input
          id="lead-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          className="flex-1 rounded-xl border border-line bg-canvas px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={state === "busy" || !consent}
          className="rounded-xl border border-accent bg-accent-soft px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50"
        >
          Get in touch
        </button>
      </div>
      <label className="flex items-start gap-2 text-xs text-muted">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
        I agree Eusate can email me about their AI support product.
      </label>
      {state === "error" && <p className="text-xs text-warn">Something went wrong. Please try again.</p>}
    </form>
  );
}
