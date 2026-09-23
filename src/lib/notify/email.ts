import type { AlertInput, EnvMap } from "./index";

/** Sends through Resend. Returns true if configured and accepted. Never throws. */
export async function sendEmail(env: EnvMap, fetchFn: typeof fetch, alert: AlertInput): Promise<boolean> {
  const apiKey = env.RESEND_API_KEY;
  const from = env.ALERT_EMAIL_FROM;
  const to = (env.ALERT_EMAIL_TO ?? "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
  if (!apiKey || !from || to.length === 0) return false;

  try {
    const res = await fetchFn("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: `[Dangote IPO guide] ${alert.title}`,
        text: `${alert.severity.toUpperCase()}: ${alert.title}\n\n${alert.body}\n`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`email alert failed: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("email alert failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
