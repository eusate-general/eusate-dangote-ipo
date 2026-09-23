export type ClientEvent =
  | "page_view"
  | "chat_open"
  | "platform_click"
  | "share_click"
  | "eusate_cta_click"
  | "news_click"
  | "pwa_install_prompt"
  | "feedback";

type Props = Record<string, string | number | boolean>;

const clip = (value: string) => value.slice(0, 200);

/** Fire-and-forget analytics. Never throws and never blocks navigation. */
export function track(type: ClientEvent, props: Props = {}): void {
  const clean: Props = {};
  for (const [key, value] of Object.entries(props)) {
    clean[key.slice(0, 40)] = typeof value === "string" ? clip(value) : value;
  }
  const body = JSON.stringify({ type, props: clean });
  try {
    if (navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {
    // fall through to fetch
  }
  void fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
