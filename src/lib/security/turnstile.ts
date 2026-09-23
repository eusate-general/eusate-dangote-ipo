import { getEnv } from "@/lib/env";

export interface TurnstileCheck {
  ok: boolean;
  reason?: string;
}

export function isTurnstileConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY);
}

let warnedUnconfigured = false;

/**
 * Verifies a Cloudflare Turnstile token. Fails CLOSED on a real rejection (bad or missing token).
 * Fails OPEN only in two deliberate cases, both logged loudly rather than silent:
 *   - not configured at all (local/staging before Cloudflare keys exist)
 *   - Cloudflare's own verify endpoint is unreachable (their outage should not take down our chat)
 */
export async function verifyTurnstile(
  token: string | undefined,
  remoteIp: string,
  fetchFn: typeof fetch = fetch,
): Promise<TurnstileCheck> {
  const env = getEnv();
  if (!env.TURNSTILE_SECRET_KEY) {
    if (!warnedUnconfigured) {
      warnedUnconfigured = true;
      console.warn(
        "TURNSTILE_SECRET_KEY is not set: bot-check is DISABLED, every visitor is treated as verified. " +
          "Do not share this URL publicly until Turnstile is configured.",
      );
    }
    return { ok: true, reason: "not_configured" };
  }
  if (!token) return { ok: false, reason: "missing_token" };

  try {
    const res = await fetchFn("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: remoteIp }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, reason: `http_${res.status}` };
    const data = (await res.json()) as { success: boolean; "error-codes"?: string[] };
    return data.success ? { ok: true } : { ok: false, reason: data["error-codes"]?.join(",") ?? "rejected" };
  } catch (err) {
    console.error("Turnstile verify unreachable, failing open for this request:", err instanceof Error ? err.message : err);
    return { ok: true, reason: "verify_unavailable" };
  }
}
