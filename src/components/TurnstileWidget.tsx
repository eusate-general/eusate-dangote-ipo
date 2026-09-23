"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { setTurnstileToken, TURNSTILE_SITE_KEY } from "@/lib/client/turnstile";

interface TurnstileGlobal {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

/**
 * Mounted once near the page root. Gets a bot-check token in the background before the visitor
 * sends their first message, invisibly for a real browser. Renders nothing if Turnstile is not
 * configured (see TURNSTILE_SECRET_KEY in the server env) — the server then treats every visitor
 * as verified, which is fine for local dev but not for a public launch.
 */
export function TurnstileWidget() {
  const [scriptReady, setScriptReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!scriptReady || !TURNSTILE_SITE_KEY || !containerRef.current || !window.turnstile) return;
    const el = containerRef.current;
    widgetId.current = window.turnstile.render(el, {
      sitekey: TURNSTILE_SITE_KEY,
      size: "invisible",
      "refresh-expired": "auto",
      callback: (token: string) => setTurnstileToken(token),
      "expired-callback": () => setTurnstileToken(null),
      "error-callback": () => setTurnstileToken(null),
    });
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      setTurnstileToken(null);
    };
  }, [scriptReady]);

  if (!TURNSTILE_SITE_KEY) return null;

  return (
    <>
      <Script
        id="cf-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        onReady={() => setScriptReady(true)}
      />
      <div ref={containerRef} />
    </>
  );
}
