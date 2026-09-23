"use client";

// Module-level, not React state: Chat.send() reads the current token synchronously at submit
// time, it does not need to re-render when a new one arrives.
let currentToken: string | null = null;

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function isTurnstileConfigured(): boolean {
  return Boolean(TURNSTILE_SITE_KEY);
}

export function getTurnstileToken(): string | undefined {
  return currentToken ?? undefined;
}

export function setTurnstileToken(token: string | null): void {
  currentToken = token;
}
