import type { AlertInput, EnvMap } from "./index";

/** Returns true if Telegram is configured and accepted the message. Never throws. */
export async function sendTelegram(env: EnvMap, fetchFn: typeof fetch, alert: AlertInput): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const text = `[${alert.severity.toUpperCase()}] ${alert.title}\n\n${alert.body}`.slice(0, 3500);
  try {
    const res = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`telegram alert failed: HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("telegram alert failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
