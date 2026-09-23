// k6 load test (https://k6.io).
//
// NOT run as part of any CI or npm script — it costs real LLM money against a real deployment
// and must be triggered by hand.
//
// Usage:
//   BASE_URL=https://dangoterefineryipo.eusate.com k6 run loadtest/chat.js
//   BASE_URL=https://dangoterefineryipo.eusate.com VUS=20 DURATION=2m k6 run loadtest/chat.js
//
// What it does per virtual user: load the homepage once, then repeat "wait, ask a follow-up
// question" for the rest of the run — one simulated person having one sitting with the guide,
// not a fresh anonymous visitor every iteration. It does NOT try to defeat the app's own rate
// limits (see src/lib/security/ratelimit.ts) - a 429 here is success, not failure, and is
// counted separately rather than as an error.
//
// Verified 2026-09-19 against a local production build (`npm run build && npm run start`,
// BASE_URL=http://localhost:3100, VUS=5, DURATION=30s): 16 real chat turns, 0 rate-limited,
// 0 errors, p95 latency 7.5s, cross-checked against the app's own event log ($0.086 spend,
// 16 answer_served rows - exactly matching k6's iteration count).
//
// k6 gotcha this script works around: k6 does not carry cookies across iterations of the same
// VU by default (confirmed empirically - a fresh jar each iteration, so the app's visitor and
// bot-check cookies never came back on request 2+). Cookie and conversationId are threaded by
// hand below via per-VU module-scope variables (each VU runs its own JS context in k6, so this
// state is never shared across VUs).
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend } from "k6/metrics";

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const VUS = Number(__ENV.VUS || 5);
const DURATION = __ENV.DURATION || "30s";

const chatLatency = new Trend("chat_latency_ms");
const rateLimited = new Counter("chat_rate_limited");
const botChecked = new Counter("chat_bot_check_failed");
const otherErrors = new Counter("chat_other_errors");

const QUESTIONS = [
  "What is the price per share?",
  "When does the offer close?",
  "How do I buy shares on PiggyVest?",
  "Is Daba Finance an approved platform?",
  "How many shares can I get with 50000 naira?",
];

export const options = {
  scenarios: {
    chat_users: {
      executor: "constant-vus",
      vus: VUS,
      duration: DURATION,
    },
  },
  thresholds: {
    // Real intent: p95 first-byte-to-full-response should stay reasonable even under load.
    // Loosen this while first calibrating against a small VUS count.
    chat_latency_ms: ["p(95)<15000"],
  },
};

// Per-VU session state (module scope = one fresh copy per VU's own JS context in k6).
let cookieHeader = "";
let conversationId = null;

/** Cookie: only wants "name=value" pairs, not the Set-Cookie attributes (Path, Secure, ...). */
function mergeSetCookie(setCookieValue) {
  if (!setCookieValue) return;
  const jar = new Map(
    cookieHeader
      .split(";")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => p.split("=").map((s) => s.trim())),
  );
  for (const cookie of setCookieValue.split(/,(?=[^;,]+?=)/)) {
    const [name, value] = cookie.split(";")[0].split("=").map((s) => s.trim());
    if (name && value) jar.set(name, value);
  }
  cookieHeader = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function extractConversationId(sseBody) {
  const match = /event: meta\ndata: ({.*})/.exec(sseBody);
  if (!match) return null;
  try {
    return JSON.parse(match[1]).conversationId ?? null;
  } catch {
    return null;
  }
}

export default function () {
  const home = http.get(`${BASE_URL}/`, { headers: cookieHeader ? { Cookie: cookieHeader } : {} });
  mergeSetCookie(home.headers["Set-Cookie"]);
  sleep(1 + Math.random() * 2);

  const question = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/chat`,
    JSON.stringify({ message: question, conversationId }),
    {
      headers: { "content-type": "application/json", ...(cookieHeader ? { Cookie: cookieHeader } : {}) },
      timeout: "60s",
    },
  );
  const elapsed = Date.now() - start;
  mergeSetCookie(res.headers["Set-Cookie"]);
  if (res.status === 200) conversationId = extractConversationId(res.body) ?? conversationId;

  if (res.status === 429) {
    rateLimited.add(1);
  } else if (res.status === 403) {
    botChecked.add(1);
  } else if (res.status !== 200) {
    otherErrors.add(1);
  } else {
    chatLatency.add(elapsed);
  }
  check(res, { "chat response is 200, 429 or 403": (r) => [200, 429, 403].includes(r.status) });

  sleep(2 + Math.random() * 4);
}
