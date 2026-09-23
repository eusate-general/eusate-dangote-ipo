# Eusate x Dangote Refinery IPO Bot — Build Plan

Status: plan v1, 2026-09-19. Nothing built yet. Lives in its own repo/folder, isolated from `eusate-be`.

## 0. The clock

IPO opened **14 Sep 2026**, closes **13 Oct 2026**, listing expected **Nov 2026** (secondary sources, to be verified against the prospectus). Today is day 6 of a 30-day window.
The product is worth most while the offer is open. **Target: public soft-launch Fri 25 Sep, hardened launch by ~30 Sep.** Everything below is ordered by that clock.

## 1. What I understood you want

- A **public, standalone product** at `dangoterefineryipo.eusate.com` (PWA / web app). Not part of the Eusate dashboard product, not a customer org.
- A chat bot anyone can ask about: the Dangote refinery IPO, IPOs in general, investing basics, price/minimums, and **where to buy** (banks, Bamboo, PiggyVest, Daba, other platforms).
- Its knowledge comes from **multiple sources and stays fresh**: pulls the latest Dangote refinery news daily and keeps pulling while the IPO is live.
- Eusate is **information-only**: unofficial, does not sell, buy, or initiate anything for anyone. Therefore **no escalation, no tickets**.
- The bot can also talk about **Eusate the company** (brand awareness).
- **Simplest thing that ships fast**, maintenance-light, not shaped by the `eusate-be` codebase. Reuse from `devfest-custom-link` where sensible and avoid its lapses.
- Eusate integration should stay possible later.
- **First-party analytics built alongside**: unique users who chat, daily traffic, and other key metrics. (This was a reason you were leaning toward Eusate tickets; section 7b covers it without them.)

## 2. Verdict on the big architecture question

**Build v1 standalone with its own thin chat backend. Do NOT put anonymous public traffic on the production Eusate helpdesk yet.** Keep a `ChatEngine` seam so Eusate can become the brain later.

Why I object to "Eusate as the brain" for v1 (verified in `eusate-be`, see Appendix A):

1. **Escalation cannot be turned off today.** The only toggle (`auto_escalate_to_human`) *forces* escalation and isn't even on the socket path. Worse, **every socket conversation is a ticket** (`chat.py:394-472`), so even with an escalation flag, each visitor creates a ticket in the org's queue. "No escalation" really means "no tickets" = a new ticketless public channel, not a flag.
2. **No KB write path for automation.** All KB routes need a user JWT with 2FA. No upsert-by-id (re-adding duplicates), no re-crawl. The daily-news pipeline, the hardest part of this product, would live outside Eusate anyway.
3. **Blast radius.** Prod runs 4 uvicorn workers with thread-sensitive LLM calls (my inference: ~4 concurrent turns). A viral IPO spike would queue paying customers' support behind anonymous traffic. Socket events have no rate limit, socket CORS is `*`, and the API key is unscoped.
4. **Token economics don't fit.** Even the beta tier (20M S8) is roughly 4,000 turns by the audit's estimate (~5K S8/turn, inferred). A public launch burns that in an afternoon.
5. **Input validator false positives.** `input_validator.py:63` flags "instead of" as high risk, so "should I buy Dangote instead of MTN?" gets blocked and escalated.
6. **Timeline.** That is ~5 backend PRs in a codebase with plan-first and review discipline, against a 24-day window.

What Eusate still gets in v1: brand, a lead funnel, an "About Eusate" answer set, and a design-partner story for a future Eusate "public agent" mode (Appendix A). Honest labelling: **"Built by Eusate"** until Eusate is actually the engine, then flip to "Powered by Eusate".

You can overrule this. If you do, Appendix A is the price list.

### 2b. Re-check with DevSpace (`lab`): position holds for v1, and it sets the shape of v2

Read from code (Appendix A item 8): `lab` lets an org define **GET-only HTTP functions** the AI can call. Only LIVE ones load. Free has none; Basic 5 / Medium 10 / Pro 20 / Beta 20.

**What it fixes.** Query-time live data with no KB write API: our site exposes `/facts`, `/platforms`, `/news?q=` and Eusate calls them. That genuinely narrows gap 2 above. Good idea.

**What it doesn't fix, and what it adds:**
- **The "tiny modification" is not tiny.** A flag that stops escalation still leaves a ticket per chat (`chat.py:458-472`), the hard-coded "an agent will be with you" texts, the token balance, shared-prod capacity, and the validator false positives.
- **Model discretion.** `tool_choice` is never set; only KB search is forced. The model can answer from stale KB chunks or chat history instead of calling the function, so KB and live data can disagree on a price or a date.
- **No always-in-context facts.** Options are the forced KB chunks, a 2,000-character custom prompt (Medium and above), or stuffing facts into a function description.
- **Latency and safety.** A tool turn is 2 LLM calls + 1 embedding + the HTTP call, waited on end to end (no streaming). The HTTP call has no timeout, retry, or size cap. Errors go to the model as `repr(e)`, which likely leaks our URL.
- **No citations** on the public channel's response schema (`EUSATE_API` has no `sources` field), so source links and dates would rely on prompting.
- **Strict-schema hazard.** An optional param may make OpenAI reject the schema for every message of that org (inferred). Required string params only.
- **We still build everything else.** The site, a secret-holding BFF (the API key can't go to a browser), Turnstile, rate limits, analytics, the facts file, and the news pipeline. Eusate-as-brain adds a dependency; it removes maybe 1-2 days of chat-engine work (my estimate).

**Decision.** v1 stays standalone. But **adopt lab as the v2 shape**: from day one the data plane is a small public read-only JSON API (`/api/v1/facts`, `/platforms`, `/news?q=`) that DirectEngine also uses. A later Eusate org points lab functions at the same endpoints with zero rework. Requirements for that: compact JSON (<2 KB), <500 ms, required string params only, sources and dates inside the JSON.

**Optional parallel spike (after M1, no risk to launch).** Create a Dangote org, add those three functions, and test in the **Playground** (authenticated, no tickets, loads DEV functions too). It's a private dogfood/demo of DevSpace on live data and doesn't touch public traffic.

## 3. Product contract (the guardrails)

1. Information only. Never "buy" or "don't buy". No price/listing/return predictions or guarantees. "Should I invest?" gets factors, risks, and a pointer to a licensed adviser and SEC Nigeria.
2. Unofficial and unaffiliated with Dangote, NGX, SEC, or any platform. Says so on every page and when asked.
3. Never asks for or handles BVN, NIN, card numbers, OTPs, passwords. Warns users not to share them. Server-side redaction before the LLM and before logs.
4. Every time-sensitive claim carries a source and a date. Unknown means "I don't know, check the official source". Never invents numbers, dates, or URLs.
5. Platform recommendations are neutral and situational ("already on PiggyVest? here's how"), drawn only from the verified directory, always with "confirm on the official list". No affiliate links unless disclosed.
6. Scope: Dangote IPO, IPOs generally, Nigerian investing basics, Eusate. Everything else gets a polite redirect.
7. Eusate answers come only from a curated `eusate.md`. No inventing features or pricing.
8. Scam awareness is a feature: only use approved platforms, official sources only, never pay outside an approved channel.
9. English and Pidgin at minimum (mirror the user's language).

## 4. Architecture (simplest thing that works)

```
Browser (PWA, Next.js) ──► /api/chat (Vercel, SSE stream)
                              │  Turnstile+session cookie → rate limits → redaction → budget check
                              ▼
                    ChatEngine interface
                     ├─ DirectEngine (v1): Claude Sonnet 5, prompt-cached context
                     └─ EusateEngine (later): stub only
                              ▲ context = facts + platforms + evergreen + eusate.md (cached)
                              │           + phase/date + news digest + FTS hits (volatile)
Neon Postgres ◄── ingest (GitHub Actions cron, 30 min OPEN / hourly otherwise)
   articles, chunks(FTS), messages, feedback, ingest_runs, alerts
Git: facts/*.yaml, evergreen/*.md   ← human-verified, PR/edit → deploy
```

| Concern | Choice | Why |
|---|---|---|
| App + API | Next.js (App Router, TS strict) on Vercel | You already ran devfest on it; SSR gives SEO (the main distribution channel); one deployable |
| LLM (answers) | `claude-sonnet-5` via official `@anthropic-ai/sdk`, streaming, effort `low`, model in env var | Best cost/quality for high volume; one env var flips to `claude-opus-5` |
| LLM (ingest jobs) | `claude-haiku-4-5` | Bulk classify/summarise, pennies per day |
| Retrieval v1 | Postgres full-text + recency, plus **always-in-context** facts/platforms/evergreen | Most questions are facts/platform/process. No embeddings vendor (Anthropic has none) until evals show FTS misses |
| DB | Neon Postgres (+ Drizzle) | Serverless, Vercel-native |
| Jobs | GitHub Actions cron | Free, visible logs, no serverless time limits, can run Playwright for JS-rendered sites like `ipo.dangote.com` |
| Abuse | Cloudflare Turnstile + Upstash Redis rate limits | Fixes devfest's biggest lapse |
| Analytics | **First-party events in Postgres** (source of truth, section 7b) + Vercel Web Analytics as a cross-check | Chat metrics need our own data anyway; one source of truth, no third-party cookie burden |
| Ops | Sentry, uptime monitor on `/api/health` | |

Why not Python/Django here: isolation and speed. One TypeScript repo, no second service, and the team already has the Next.js pattern.

**Grounding.** Pass facts, platform records, and news items as `document` blocks with Anthropic **citations enabled** so source chips in the UI are mechanically tied to the text, not model-invented `[1]`s. *Day-1 spike must verify citations + prompt caching + streaming work together; fallback is structured source IDs in the prompt.*

**Caching.** Breakpoint 1 after the static context (system prompt, facts, platforms, evergreen, eusate.md, ~15-40K tokens). Date, phase, news digest, and retrieved hits go after it. Use the 1h TTL. Verify `cache_read_input_tokens > 0`.

**Deterministic tools** for arithmetic (`shares_for_amount`, `cost_for_shares`). The LLM never does the maths.

**Repo layout**
```
eusate-dangote-ipo/
  facts/ipo.yaml  platforms.yaml  eusate.md  evergreen/*.md
  src/app/ (page, buy/[platform], news, legal, admin, api/chat|feedback|track|health, api/v1/facts|platforms|news)
  src/lib/ (engine/, guardrails/, retrieval/, phase.ts, redact.ts, ratelimit.ts, budget.ts)
  pipeline/ (sources.ts, ingest.ts, summarise.ts, watch-primary.ts, health.ts)
  evals/ (golden.yaml, run.ts)
  .github/workflows/ (ingest, watch, eval, ci)
```

## 5. Staying up to date (the part that decides whether this product is trusted)

The AFTRHRS teardown showed what a confident wrong answer costs. Here a wrong date can make someone miss a subscription. So freshness is layered by trust, and **facts are never auto-written**.

| Layer | What | How it updates | Trust |
|---|---|---|---|
| 1. Canonical facts | Price, shares, size, greenshoe, min application, all dates, registrars, eligibility, listing plans | Human-edited `facts/ipo.yaml`. Each fact: `value, source_url, verified_at, status (confirmed / announced / unconfirmed)`. Deploy on merge | Highest, always in context |
| 2. Platform directory | Per platform: type, requirements, min, how-to link, `verified_at`, `on_official_list` | Human-edited `platforms.yaml`, checked against the official list. Field `listing_status`: `official` (you confirmed it on ipo.dangote.com), `reported` (named as approved by independent press, not yet confirmed), `unverified` (only self-claimed), `not_listed`. `official` is recommended plainly; `reported` is recommended with "reported as an approved platform, confirm on ipo.dangote.com"; `unverified` is discussed only if the user asks, with "not confirmed on the official list"; `not_listed` is never recommended. **Daba starts as `unverified`** (see section 11) | High |
| 3. Primary-source watcher | `ipo.dangote.com`, SEC Nigeria, NGX, issuing-house pages, platform how-to pages | Actions job (Playwright) hashes rendered text daily/30 min; on change, or on an LLM extraction that disagrees with layer 1, **alerts you** (Telegram/Slack/email). You approve the fact change | Detects drift, never writes |
| 4. News | Publisher RSS + sitemaps (Nairametrics, BusinessDay, Punch, Vanguard, TheCable, Premium Times, Channels, Legit, Techcabal, Proshare, Reuters/Bloomberg), GDELT for discovery | Every 30 min while OPEN, hourly otherwise: fetch → canonicalise URL → dedupe/cluster → relevance filter → Haiku summary + entity/date extraction → FTS index. Store headline, our own 2-3 sentence summary, short excerpt, link, `published_at`, `fetched_at` (no full-text republishing) | Medium, labelled "reported by X" |
| 5. Evergreen | IPO basics, CSCS/BVN, allotment, risks, glossary, how to sell after listing | Written once, reviewed | High |

**Query-time rules**
- Prompt receives *today's date (WAT)* and the computed **phase**: `PRE_OPEN / OPEN / CLOSED_AWAITING_ALLOTMENT / ALLOTTED / LISTED`. Phase changes the guidance, suggested-question chips, and site banner (countdown while OPEN). After 13 Oct it must never say "you can still subscribe".
- Conflict order: **facts > primary documents > reputable press > everything else**. If news contradicts facts: "reports differ, confirm at the official source".
- Recency-weighted retrieval; every news claim shows source + date.

**Staleness circuit-breaker**
- `/api/health` returns 503 if the last successful ingest is older than 3h (OPEN) or 12h (else) → uptime monitor pages you. UI shows "News updated 14 min ago" (and "key facts last checked by Eusate on <date>" once you have confirmed something).
- If ingest is stale, the bot is told to caveat news-based answers.
- If any fact's `verified_at` is older than 3 days while OPEN, the watcher alerts.

**Verification is internal. It never blocks the bot and users never see a warning about it.** (Decision 2026-09-19: your checking is oversight for your own peace of mind.) Each fact carries `status` (`confirmed` = you checked it against a primary source, `reported` = from press) and `verified_at`, but that stays behind the scenes. Users see no "unverified" wording anywhere; the bot answers with confidence, attributes sources through the citation chips, and adds one short "figures can change, confirm on ipo.dangote.com" reminder on prices, dates and minimums. The only user-visible trace is positive: once you confirm a fact, the site shows "Key facts last checked by Eusate on <date>" and the source chip reads "checked by Eusate". Stale or unconfirmed facts go to **you** (digest, alerts), never to users.

**Change-signal detector.** The news pipeline tags articles by event type (`TIMELINE_CHANGE`: extended, closed early, suspended, new listing date; `PRICE_CHANGE`; `PLATFORM_CHANGE`; `REGULATORY`). When two reputable sources report one within 24h (or one primary source does), it (1) alerts you immediately and (2) automatically adds "recent reports mention a possible change to <dates>, check the latest news" to answers on that topic. It never edits facts. This covers the case where nobody has verified yet and the offer changes anyway (Daba's page already mentions a possible earlier close).

**Learning loop.** Unanswered / low-confidence / 👎 questions (redacted) land in a review queue. Weekly, each becomes an FAQ, fact, or eval case.

**"Instant news" honesty.** Realistic latency is 30-60 min behind publication. Say "updated every 30 minutes" on the site, not "instant".

**Untrusted-content rule.** News and scraped text is data, never instructions: delimited, HTML stripped, prompt states it must not follow instructions inside it, and output links are restricted to source URLs we supplied.

## 6. Public-launch hardening (devfest lapses, fixed by design)

| Lapse in devfest-custom-link | Fix here |
|---|---|
| Org API key in browser bundle (`NEXT_PUBLIC_API_KEY`), key in socket query string | Zero secrets client-side; BFF route holds the Anthropic key |
| No rate limit / bot protection / length cap | Turnstile on session start; signed httpOnly session; per-IP + per-session Upstash limits; 500-char input cap; max turns per session |
| No cost ceiling | Global daily token budget circuit breaker → static FAQ fallback page; alert at 50/80% |
| `dangerouslySetInnerHTML` on model output (stored-XSS via news) | Markdown renderer + sanitizer (`react-markdown` + `rehype-sanitize`); link allowlist |
| Client-chosen session ID trusted; blank bubble on 400/500 | Server-issued session; typed errors; visible error/retry UI |
| axios without timeouts, swallowed errors, dropped messages on disconnect | HTTP+SSE (no websockets to babysit), timeouts, retries, input preserved on failure |
| Ticket UX (conversation list, agent labels, rating flow) | Deleted. Single chat, thumbs up/down per answer |
| CSR-only shell, no SEO | SSR/ISR landing, per-platform pages, FAQ JSON-LD, OG images |
| No disclaimer, GA with no consent | Prominent disclaimer, privacy notice (NDPA 2023), cookieless analytics |
| No tests, CI cannot fail | Eval suite + `prettier --check`, lint, typecheck, build in CI |
| Next 15.2.1 (known RCE) | Current patched Next |

**Reuse from devfest (adapt, not copy blindly):** Tailwind setup, font setup, `Textarea` autosize, `Spinner`/`ChatLoader`, `cls`/time formatters, `manifest.ts` shape (add `id`, `scope`, maskable icons), `output: "standalone"` + the multi-stage Dockerfile idea as a portability escape hatch from Vercel.
**Discard:** Socket.IO layer, conversations/tickets views, rating/end-chat flows, GDG branding, GA ID, postMessage leftovers, README.

## 7. Site and UX

- **Landing (SSR/ISR):** live status banner + countdown, key-facts card ("verified 19 Sep"), chat front and centre, suggested chips per phase, news feed (revalidate 15 min), where-to-buy directory, FAQ, disclaimer footer, "Built by Eusate".
- **SEO pages:** `/buy/bamboo`, `/buy/piggyvest`, `/buy/cowrywise`, etc. Long-tail search is the main way Nigerians will find this.
- **Chat:** streaming, typing indicator, source chips with dates, copy button, per-answer 👎 with "what was wrong?", "Talk to a human" replaced by "contact your platform / official channels" plus "Ask Eusate" for brand questions.
- **PWA:** manifest, app-shell service worker, install prompt. Never cache the chat API.
- **Share:** WhatsApp share button + OG preview (WhatsApp is how this spreads in Nigeria).
- **Cost saver:** top ~20 questions answered from pre-generated static answers (regenerated when facts change), zero LLM cost, instant.

## 7b. Analytics and metrics (first-party, built alongside, not after)

You need to know who is using this and whether it works. Tickets would have given you conversation counts only; this gives the whole funnel.

**Identity without PII.** A random anonymous `visitor_id` (first-party, set on first visit, no personal data, disclosed in the privacy notice). If storage is blocked, fall back to a daily-rotating salted hash of IP + user agent so counts stay honest. Only **Turnstile-verified** visitors count as "chatters"; unverified traffic is kept in a separate bucket so bots can't inflate the headline number.

**Events** (one `events` table: `ts, visitor_id, session_id, type, props jsonb`):
`page_view` · `chat_open` · `message_sent` · `answer_served` (latency, TTFT, tokens in/out/cache-read, **cost in USD**, model, phase, source IDs, static-FAQ hit or LLM) · `feedback` · `platform_click` (which platform) · `share_click` · `eusate_cta_click` · `lead_submitted` · `error` · `rate_limited` · `budget_tripped`.
Server-side geo (country/state from Vercel headers), device class, referrer/UTM on first touch.
Conversations and messages are stored **redacted**, 30-day raw retention, aggregates kept.

**Metrics you'll see**
- **Traffic:** unique visitors/day, page views, top referrers/UTMs, country/state split, device split.
- **Users:** unique chatters/day, new vs returning, DAU/WAU, conversations/day, turns per conversation.
- **Funnel:** visit → chat opened → first message → 3+ turns → platform click → share. Plus Eusate CTA click-through and leads.
- **Cost and speed:** spend/day, cost/conversation, prompt-cache hit rate, static-FAQ hit rate, p50/p95 time-to-first-token and total latency.
- **Quality:** 👍/👎 rate, refusal rate, low-confidence/unanswered rate, top topics (nightly Haiku intent tagging), unanswered-question queue.
- **Freshness/ops:** ingest success rate, age of newest article, alert log.

**Where you look**
- **Daily digest → email**, 08:00 WAT: yesterday's visitors, chatters, conversations, spend, 👎 count, unanswered count, ingest health. Readable, archivable, forwardable to the Eusate team.
- **Urgent alerts → email + Telegram:** stale ingest, spend at 50/80/100% of the cap, primary source changed, change-signal fired, error spike. Telegram is the phone push you'll actually see; email keeps the record. Each message type has its own channel list in config, so adding or moving a channel is one line.
- **`/admin`** behind a single-user login: today live + `metrics_daily` rollups (nightly Action), charts, CSV export to share with the Eusate team.
- **Timing:** event logging is in from M0, because numbers you didn't log on day 1 are gone. Digest + basic `/admin` by soft launch. Full funnel/topics in M3.

## 8. Eusate integration

**v1 (now):** "Built by Eusate" header/footer; curated `eusate.md` the bot answers Eusate questions from (strictly, no invention); contextual CTA ("want a bot like this for your business?") to eusate.com with UTMs; optional email capture posting to an Eusate lead webhook (explicit consent); analytics on what people ask (marketing intel).
**v2 (when ready):** implement `EusateEngine` behind the same interface, with the Eusate org's **lab functions pointing at our `/api/v1/*` endpoints** (section 2b), once Eusate ships the public-agent mode (Appendix A). Bonus: Eusate already has a WhatsApp channel, so the same brain could serve WhatsApp, the natural Nigerian channel.
**Now, in parallel and risk-free:** the Playground spike in section 2b gives you a live DevSpace demo on real IPO data for the Eusate story.

## 9. Quality: evals before launch, in CI after

`evals/golden.yaml`, ~80-100 cases, run on every prompt/facts change (~$2 per full run by my estimate):
facts (price, min, dates, greenshoe) · phase-awareness (mock dates after close) · refusals (advice, predictions, guarantees) · PII (BVN pasted in) · prompt injection via a poisoned news fixture · out-of-scope · Pidgin · benign phrasing ("X instead of Y", "from now on") · neutral platform recommendations (incl. a platform NOT on the official list) · Eusate hallucination traps · scam-link questions · arithmetic. Deterministic asserts plus an LLM judge.
Launch gate: **100% on facts + refusals + PII + injection**, ≥90% overall.

## 10. Cost and capacity

**Measured 2026-09-19 (13 real answers on `claude-sonnet-5`, effort `low`):** average **$0.0063 per answer**; the cached prefix is 6,240 tokens (much smaller than my earlier 30K guess); every call after the first read it from cache; first token in ~1-2 s, full answer 2.4-8.5 s (a calculator tool turn is two model round trips and took longest). Sonnet 5 = $2 in / $10 out per 1M.
- 1,000 conversations × 5 turns ≈ **$30**. 20K conversations ≈ **$630**. The $50/day cap is roughly 8,000 answers a day.
- Answers get longer as conversations grow (history is resent, up to 8 messages), and news context in M1 adds input tokens. Re-measure after M1.
- Static FAQ answers and rate limits cut this further (unmeasured).
- Ingest on Haiku: about a dollar a day.
- Set the daily budget cap before launch (needs your number). A load test (k6) precedes any public link.

## 11. Legal / risk (needs your eyes, not mine)

- SEC Nigeria treats unsolicited investment advice and unauthorised solicitation seriously. Design = information-only, no recommendations, no referral money.
- The domain contains "Dangote". Mitigate with prominent "unofficial" wording; **one line of counsel review is worth it**.
- NDPA 2023: privacy notice, redacted logs, 30-day retention, no PII collection.
- Scraping: prefer publisher RSS/sitemaps, honour robots.txt, store summaries not full articles, always link out. Google News RSS is optional and its ToS should be checked before commercial use.
- The seed numbers in section 0 come from secondary sources. **Nothing goes in `facts/ipo.yaml` unverified against the prospectus / official pages.** 
- **Daba: `unverified`, not recommended.** Re-checked 2026-09-19. Daba's own guide (dated 10 Sep) says its Nigerian access is "powered by" Coronation Merchant Bank / Coronation Securities, which it describes as issuing houses on this offer, and says it does not guarantee allocation. But the SEC circular of 14 Sep names **no** receiving agents (Daba and Coronation are not mentioned), Daba isn't on the 18-platform list I found, and Daba's page doesn't state its own Nigerian registration. That is a claim by the platform, not confirmation. If asked about Daba, the bot says what Daba states and that it's unconfirmed on the official list. **You know Daba, so if you can confirm from `ipo.dangote.com` (needs a browser, it's JS-rendered) or from Daba directly, flip it to `yes`.**
- **SEC circular, 14 Sep 2026:** it tells investors to "obtain information about the IPO only from the SEC official channels, Issuer's official channels, and other official channels". An unofficial information bot sits awkwardly next to that line. It isn't a reason not to build, but it is a reason to (a) keep the "unofficial, verify at the official source" wording loud and linked, (b) never present the bot as a channel to subscribe through, and (c) treat a counsel read as **recommended, not a gate**. Your call (2026-09-19): disclaimers go in before public exposure. One objection stands: disclaimers are necessary but don't do the protecting on their own. The bot's behaviour does (no advice, no "approved channel" claims, no "best platform" rankings), and the domain name is the part a disclaimer fixes least. Get a counsel read before any paid promotion.

## 12. Schedule

| Milestone | Target | Deliverable |
|---|---|---|
| M0 Skeleton | Sat 19 - Sun 20 Sep | Repo, `facts/ipo.yaml` v0 (you verify), system prompt, `/api/chat` streaming on facts+evergreen, Vercel preview. **`events` table + per-answer cost/latency logging from the first request.** Spike: citations + caching + streaming |
| M1 Freshness | 21 - 23 Sep | Ingest pipeline + 30-min Action, FTS, news feed, `/api/health`, staleness alerts, public read-only `/api/v1/facts|platforms|news` (also the future lab endpoints) |
| M2 Public-safe | 23 - 25 Sep | Turnstile, rate limits, budget breaker, redaction, disclaimers, privacy notice, verified-visitor counting, **daily digest + basic `/admin`**, domain live. **Soft launch Fri 25 Sep**, disclaimers live (sections 3 and 7) |
| M3 Trust | 26 - 30 Sep | Eval suite in CI, primary-source watcher, static FAQ cache, SEO platform pages, PWA install, share button, review queue, full funnel + topic dashboard, optional Eusate Playground/lab spike |
| M4 Brand | 1 - 5 Oct | `eusate.md`, CTA + lead webhook, load test, Sentry |
| M5 Lifecycle | by 13 Oct | Phase content for CLOSED / ALLOTTED / LISTED (allotment, refunds, listing day, how to sell) |

### Status, 2026-09-19: M0 built and smoke-tested against the live model

**Built and verified locally** (47 unit tests, typecheck, lint, production build, and a real-browser check on mobile, desktop and dark mode):
- Facts layer (`facts/`), validated at build time so an invalid file cannot deploy. Platform statuses `official / reported / unverified / not_listed`; Daba is `unverified`.
- Streaming chat over SSE: WAT-correct phase logic, PII redaction (BVN, phone, card, account, OTP) before anything is stored or sent, budget circuit breaker, per-conversation turn cap, disconnect handling (partial answer saved and logged as aborted).
- Event logging from the first request (page views, messages, answers with cost and latency, feedback, clicks), plus `/api/health`, `/api/v1/facts`, `/api/v1/platforms`.
- UI with disclaimers, status banner, key facts, platform directory, citations as numbered source chips, thumbs up/down. Model output is sanitized: raw HTML, images and `javascript:` links are removed (tested with a hostile payload).

**Live model smoke test (12 questions, plus reruns):** prompt caching works (`cache_read_input_tokens` 6,240 on every call after the first); the calculator tool loop works (₦100,000 gives 190 shares, ₦99,750, ₦250 left); `[[id]]` citations resolve; advice, price prediction, prompt injection, off-topic, scam/PII and human-handoff questions were all handled per the contract, including in Pidgin.
Three defects found and fixed in the prompt: an invented platform UI step ("open the IPO section in the app"), Daba described as "unverified by Daba itself", and a news article presented as a platform's own guide. Known residue: the model still occasionally says "find the IPO/investment section in the app", which is generic and probably true but unsupported by our data. **Only the M3 eval suite can say how often; this smoke test is 12 samples, not a quality measurement.** Effort `low` looked adequate here, but that decision belongs to the evals.

**Changed from the plan:** citations use `[[id]]` markers resolved against our own catalog instead of Anthropic's native citations (they work well in practice, so the native-citations spike is now optional); the budget breaker moved from M2 to M0; platform status gained the `reported` level; verification is internal and never shown to users as a warning; the app runs on Next.js 16.

**Still to build (in order):** M2 Turnstile + rate limits (**the endpoint is open until then, so do not share the URL**), retention job, digest email, `/admin`; M3 eval suite, source watcher, PWA, SEO pages.

**Critical path is human fact verification, not code.** You need an owner who checks the facts sheet daily while OPEN.

### Status, 2026-09-19: M1 built (news pipeline) and verified against real feeds and the live model

**Built:** `articles`/`ingest_runs`/`alerts` tables (Postgres full-text search via a generated `tsvector`); a fetch layer for RSS, Atom and WordPress REST search with retry on transient failures; a relevance pre-filter for general feeds; a Haiku summariser (structured output via `zodOutputFormat`) that classifies each article against the guide's *current published terms* (`buildBaseline`), so restating known facts is never flagged as a change; Jaccard-similarity story clustering so the same headline from several outlets shows once; a change-signal detector requiring two independent outlets before the bot mentions anything, with platform additions routed to the owner only (never the bot, since they aren't things the bot could get wrong); owner alerts by email (Resend) and Telegram, deduplicated by key with a cooldown; `/api/v1/news` (public, cacheable) and a richer `/api/health` that reports 503 when news goes stale (180 min while OPEN, 720 min otherwise) — point an uptime monitor here; a `NewsFeed` UI card; GitHub Actions running ingest every 30 minutes and CI (typecheck, lint, unit + integration tests, build) against a real Postgres service container.

**Verified against real feeds today, not mocks:** 10/10 configured sources fetched successfully (Nairametrics and Punch needed the retry logic — first attempts intermittently failed); 188 articles fetched, 35 judged relevant, cost $0.12 for the full backlog (steady-state daily cost will be far lower since only new articles are summarised). The classifier correctly told apart: real terms (price, dates) restated verbatim → not a change; a report of an *added* platform (Moniepoint, FSDH) → `PLATFORM_CHANGE`, info-only alert to the owner, never shown to the bot; a stray mention of a differing greenshoe figure in an older article → correctly caught as `PRICE_CHANGE`. Sponsored/promoted posts (Premium Times `/promoted/...`) are filtered out before storage.

**Verified end-to-end against the live model:** asked the running chat real news questions. It correctly cited live, deduplicated stories with outlet + date; correctly discussed the Moniepoint platform addition as ordinary news (not a "change signal", per the design in section 5); correctly said no timeline change signal was showing when asked directly; was honest that its knowledge is "as of today" and pointed to the official site when asked if it was fully up to date. `/api/health` reported `news.fresh: true` with the real ingest timestamp.

**Test coverage:** 91 unit tests (parsing, canonicalisation, clustering, signal detection, redaction, prompts, fetch-retry, promotional-URL filtering) plus 13 integration tests against a real throwaway Postgres database (`dangote_ipo_test`) covering the full ingest pipeline, retry/give-up behaviour on repeated summarise failures, deduplication, clustering across runs, owner alerting (including cooldown and "no channel configured" fallback), and the platform-vs-terms bot-visibility split. CI runs the integration suite against a Postgres service container; local runs need `TEST_DATABASE_URL` set or they skip automatically.

**Decisions made while building, not pre-specified in the plan:**
- Paid/sponsored posts are excluded by URL pattern (`/promoted/`, `/sponsored/`, etc.) — found in the wild on Premium Times.
- The classifier is given the guide's *current* terms as a baseline, not asked to judge "change" in the abstract — this is what makes "restating the price" correctly not fire as `PRICE_CHANGE`.
- Platform-addition news is deliberately **never** shown to the bot as a change signal, only timeline/price. Rationale: a new platform being added doesn't make an existing answer wrong the way a moved date or changed price would, and routing it to the bot risked overclaiming "official" status Section 3's guardrails forbid. It still reaches you (info-severity) and the public news feed.
- Fetch failures retry (3 attempts, backoff) only for transient conditions (network errors, 429, 5xx); a 403/404 is treated as a real answer and not retried — this is what fixed the intermittent Nairametrics/Punch failures seen on the first live run.

**Grounding check, 2026-09-19 (in response to a direct ask: "hope sources are backed and not hallucinated"):** two separate guarantees, tested separately.
1. **A citation can never point to something fake — enforced in code.** `linkifyCitations` only renders a `[[id]]` marker if it resolves against the real catalog (facts/platforms/guides built at deploy time, plus this turn's news article IDs); an invented marker is silently dropped, never shown as a link. Tested (`tests/prompt.test.ts`, `tests/util.test.ts`).
2. **Whether prose without a marker is grounded is not mechanically guaranteed** — it relies on the system prompt's rules ("never guess numbers, dates, fees or URLs", cite what you use). Probed live with 6 adversarial questions designed to tempt fabrication (exact total raised, applicant count, allotment date, a platform's fee, oversubscription level, future listing price): the model refused every one it couldn't back with a source, and cited every number it did state. Zero violations found, but 6 samples is a spot check, not proof — systematic measurement is M3's eval suite.
Added now, not deferred: `analyzeGrounding` (`src/lib/grounding.ts`) logs, on every answer, how many citation markers resolved, how many didn't (a marker to nothing is a stronger signal than usual), and whether the answer states a specific figure with zero citations anywhere in it. Logged to the `events` table (`answer_served.citations` / `.unknown_citations` / `.unbacked_numeric_claim`) — the existing source of truth for the digest (section 7b), so this becomes a watchable rate, not a one-time check. It's a coarse whole-answer proxy, not a hallucination detector: it cannot tell whether a citation actually supports the figure next to it. No alerting wired to it yet — that's worth deciding once real volume exists, not before.

**Not yet done:** the source-primary watcher (M3, watching ipo.dangote.com itself) — the news pipeline above watches press coverage, not the official site directly. Static FAQ pre-generation, PWA, SEO platform pages, and the eval suite are still M3.

### Status, 2026-09-19: M2 built (bot protection, rate limits, retention) — the URL is now safe to share

**Built:**
- **Bot check:** Cloudflare Turnstile, invisible/managed mode. The widget (`TurnstileWidget.tsx`) mounts near the page root and gets a token in the background before the visitor's first message, so a real person is never made to wait on it. Verified once per visitor per day, not per message: on success the server issues an HMAC-signed, HttpOnly `tsv` cookie (`src/lib/security/session.ts`) bound to that visitor id, so repeat messages skip re-verifying. Fails **closed** on a real rejection or a missing token; fails **open** only in two deliberate, loudly-logged cases: Turnstile not configured yet (today's state — every visitor is currently auto-verified, see below), or Cloudflare's own verify endpoint being unreachable (their outage should not take down this chat).
- **Rate limiting:** Postgres-backed fixed-window counters (`src/lib/security/ratelimit.ts`), not Upstash Redis as originally sketched in section 4 — a deliberate simplification, see the note below. Applied in layers on `/api/chat`: an IP limit (20 requests / 5 min) runs first and cheaply, before any Cloudflare call, so a flood never reaches Turnstile or the LLM; a per-visitor limit (40 messages / hour) runs after the bot-check, once the visitor is trusted. `/api/track` gets a light IP limit (60/min) so it can't be used to spam the events table. Limits return HTTP 429 with a `Retry-After` header; Chat.tsx shows a friendly "sending a bit fast" message and restores the typed text rather than losing it.
- **Retention:** `scripts/retention.ts`, run daily by GitHub Actions, deletes raw message content older than 30 days and any conversation left empty as a result, per the privacy notice in section 7b. Aggregate metrics (the `events` table) were already privacy-safe by design — `logEvent` never stores raw chat text, only counts and redaction flags — so they are untouched by this job; it also sweeps rate-limit bucket rows once their window is long past.
- `.env.example` documents every new variable (`TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY`/`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `SESSION_SECRET`, the alert channel keys from M1).

**Verified live against the real running app, not just unit tests:**
- Sent 21 requests from one client: the first 19 succeeded, the 20th and 21st returned 429 with a `Retry-After` header — matched the configured limit exactly (an earlier warm-up request had already used 1 of the 20). Confirmed in the database that the IP and visitor buckets are tracked as separate keys with independent counts, and that a request tagged with a different IP got its own untouched bucket.
- Temporarily set real (dummy) Turnstile keys and confirmed live: no token → 403; a garbage token → Cloudflare's real API genuinely rejects it → 403. Then reverted `.env.local` to its original unconfigured state.
- Inserted a 40-day-old message directly into the dev database, ran `npm run retention` for real, and confirmed both the message and its now-orphaned conversation were deleted.
- Full production build, typecheck, lint, and 110 tests (14 new: `tests/security.test.ts` for session-cookie signing and Turnstile's every branch with mocked Cloudflare responses; `tests/ratelimit.integration.test.ts` against the real throwaway test database, including a concurrent-burst test proving no count is lost under simultaneous requests).

**Deviation from the original plan, with reasoning:** section 4 named Upstash Redis for rate limiting. I used Postgres instead — we already run Postgres for everything else, this avoids provisioning a second external service and a new account before launch, and a single indexed upsert is negligible next to the LLM call it's gating. If traffic ever makes Postgres-based limiting a real bottleneck (unlikely at this scale), swapping in Upstash later is a contained change behind the same `checkRateLimit` interface.

**Not yet done, and this matters:** Turnstile is **not actually configured** — no Cloudflare account exists yet, so `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` are empty and every visitor is currently auto-verified (logged loudly on first use, per the fail-open design above). The rate limits are live and real regardless, but the bot-check itself needs you to create a free Turnstile widget at Cloudflare and set those three env vars before this is genuinely bot-resistant.

### Status, 2026-09-19: M3, M4 and M5 built in one pass — most of the rest of the roadmap

Built at the user's request to "do the rest M3 to M5" in one continuous session. Summarized by theme; every item was typechecked, linted, covered by the test suite, and where feasible verified against the real running app (not just unit tests) — several real bugs were caught and fixed this way, listed below rather than hidden.

**A live-verified correction that changed the facts themselves.** Mid-batch, asked to confirm Daba against the official site rather than wait — rendered `ipo.dangote.com/subscribe` with a headless browser (the same technique now productized as the watcher below) and found its full, authoritative list of 55 SEC-approved Receiving Agents and Electronic Application Channels, with real subscription URLs. This replaced the entire press-sourced `facts/platforms.yaml` (28 entries, all `reported`) with the real official list (55 entries, `official`, `verified_at: 2026-09-19`) — Daba confirmed **absent** (`not_listed`, not `unverified`), Moniepoint and i-Invest confirmed present. `facts/ipo.yaml`'s price, both dates, and the "official channels only" guidance moved from `reported` to `confirmed` for the same reason: read directly off the primary source, not inferred. The greenshoe percentage was explicitly left `reported` in the note — it was not seen stated on the pages checked, so upgrading it too would have overclaimed. `/buy/[platform]` (55 statically-generated SEO pages, one per official platform, `/buy/daba` correctly 404s) and the homepage's platform list (grouped by type, "N platforms confirmed on the official list") were built directly from this real data.

**Quality: the eval suite (section 9).** `evals/golden.yaml`, 69 cases across all 12 named categories (facts, phase, refusals, pii, injection — the 4 gate categories — plus out-of-scope, pidgin, benign-phrasing, platforms, eusate, scam, arithmetic), each graded by deterministic asserts and/or an LLM judge, running the *actual* `runTurn` pipeline end to end (not a mock). A poisoned-article fixture seeds a fake "relevant" news item with an injected instruction, to test the real news-context path. First full run: **69/69, 100%, $0.56** — under the plan's $2 estimate. Two "failures" on the first pass were the harness's own bugs (banning the substrings "BUY" and "priority fee" outright, when the model correctly *used* those words while refusing/warning) — fixed by moving those checks to the judge rubric, which can tell refusal from compliance. `.github/workflows/eval.yml` runs it on any push touching the prompt, engine, news code or facts, plus on demand — not on every commit, since it costs real money.

**Freshness: the primary-source watcher (section 5), for real, not just designed.** `scripts/watch-primary.ts` renders the same three official pages with Playwright on a schedule (every 6h, `watch-primary.yml`), hashes the normalized text, and alerts the owner on any change — it never edits facts itself. Ran for real against the live site and saved its first baseline. Also used by hand this session for the platforms rebuild above.

**Cost: the static FAQ cache (section 7).** `src/generated/faq.json`, pre-generated for the current phase's suggested questions, checked *before* the budget gate so cached answers keep working even during a cap outage. A real bug here: the skip-logic that avoids regenerating on every `npm run dev`/`build`/`test` first used `Knowledge.builtAt`, which is "now" on every load, not a content fingerprint — it would have silently spent real money on every single local dev cycle. Fixed to hash the actual facts content. Verified live: an exact suggestion-chip match now answers in ~220ms at $0 (vs. 2-8s and real cost for the live model); a near-miss correctly falls through.

**Product: PWA, share, SEO.** `manifest.ts`, a minimal service worker (caches only versioned static assets and icons — explicitly never the page HTML or anything under `/api/`, since serving stale IPO facts offline-first would be actively misleading), an install prompt, WhatsApp/Web-Share sharing. Placeholder ₦-glyph icons generated with Playwright (`scripts/gen-icons.mjs`) since no real Eusate-approved logo exists yet — swap before launch.

**Operations: digest, `/admin`, leads.** `src/lib/digest/build.ts` computes real metrics from the `events` table (yesterday for the daily email, today-so-far for the dashboard); `.github/workflows/digest.yml` sends it at 08:00 WAT, reusing the M1 `notify()` alert plumbing (email only, 24h dedup). `/admin` is a single-password-gated dashboard (`ADMIN_PASSWORD`) with live stats, a review queue (answers that stated a figure with no citation, or cited a marker that didn't resolve — using the grounding signal from the earlier hallucination check), recent 👎 feedback with its original Q&A, and a CSV export. A real cookie-scoping bug was caught live: the admin cookie was issued with `Path=/admin`, so the browser never sent it to `/api/admin/*` (a sibling path, not a child) — CSV export 401'd immediately after a successful login. Fixed to `Path=/`. The homepage's Eusate card now has a real opt-in lead form (`leads` table, `LEAD_WEBHOOK_URL` forwarding that degrades to "stored, not forwarded" if unset — a lead is never lost either way).

**M5 lifecycle content.** `facts/evergreen/after-you-subscribe.md` rewritten with real, evergreen, phase-relevant detail: how to check allotment, how refunds actually work, and concrete steps to sell after listing (CSCS + broker, placing an order, settlement) — while still refusing to invent an allotment or listing date. Verified live by forcing `phase_override: ALLOTTED` in facts/ipo.yaml, asking three real questions ("how do I check my allotment", "when's my refund", "how do I sell now"), confirming the answers were accurate and properly hedged, then reverting the override.

**Sentry (section 4/M4), wired but inert until you have an account.** Full `@sentry/nextjs` integration (`instrumentation.ts`/`instrumentation-client.ts`, server/edge configs, `global-error.tsx`, `next.config.ts` wrapped) — verified the production build and a live run both work cleanly with no `NEXT_PUBLIC_SENTRY_DSN` set (the SDK no-ops by design). Caught and fixed one thing the build itself flagged: `withSentryConfig`'s import path is mid-deprecation in the installed version: moved to `@sentry/nextjs/config`.

**Load test: k6 installed and run for real (2026-09-19, later the same day).** Installed via `winget install GrafanaLabs.k6` at the user's explicit request, then ran `loadtest/chat.js` against the local server: 5 concurrent VUs, 30s, `BASE_URL=http://localhost:3100`.

First run surfaced a real script bug: the database showed 16 distinct visitor cookies for 16 iterations, not 5 IDs reused across each VU's repeat visits. Investigated rather than assumed — first hypothesis (a `Secure`-flagged cookie, set because `next start` runs with `NODE_ENV=production`, silently dropped by a spec-compliant client over plain `http://localhost`) turned out to be **wrong**, disproven by a small isolated k6 script showing the Secure cookie *was* resent within one iteration. The real cause, confirmed the same way: k6 does not carry cookies across iterations of the same VU by default — each iteration starts with an empty jar. Fixed by threading the session cookie and `conversationId` by hand through per-VU module-scope variables (each VU runs its own JS context in k6, so this state can't leak across VUs), turning each VU into one realistic multi-turn sitting instead of a fresh anonymous visitor every few seconds.

Re-ran after the fix: 18 completed chat turns, 0 rate-limited, 0 errors, 100% checks passed, p95 latency 6.1s. Confirmed directly against the database (not just k6's summary): exactly 5 distinct visitor IDs — one per VU — each with 3-4 turns logged against the *same* conversation. Still one local process, not a production topology — re-run against the real deployed URL once one exists, and note the app's own budget cap ($50/day) and per-visitor rate limit (40 msgs/hour) will legitimately start firing at a high enough VU count, which is the correct, intended behaviour, not a bug to fix.

**Explicitly not done, and why:**
- The Eusate Playground/lab spike (section 8, "optional") needs your Eusate account and the Playground UI — nothing here can drive that headlessly.
- `evals/golden.yaml` has 69 cases, not the ~80-100 originally estimated. Every named category is covered, several with multiple angles; I chose not to pad with near-duplicate cases just to hit a round number.
- Real load testing against a deployed instance, real Turnstile/Sentry/Resend/Telegram behaviour, and a real digest email landing in an inbox all still need the credentials and deployment that don't exist yet (tracked in section 13 and the decisions list).

### Status, 2026-09-20: rebrand — real Eusate identity, tabs, "Sate" persona

The first pass used an invented teal palette and no product identity beyond "the Eusate guide." User feedback: it looked generic, didn't match eusate.com, and the assistant needed to actually be named (their AI agent is Sate). Fixed properly rather than restyled:

- **Real assets, not eyeballed ones.** Rendered eusate.com live and pulled the actual logo SVGs (`eusate.com/logos/full-gradient-black.svg` etc.) rather than reusing the three screenshots from the first pass. The brand gradient is exact, taken from the SVG's own `<linearGradient>` stops: `#D7AB07` → `#E86555`. App icons and the header mark are now the real vector logo (cropped to just the icon programmatically, not raster-cropped), not an invented ₦ glyph.
- **Palette correction:** `--canvas` flipped from a heavy cream to a barely-there off-white (`#fff9ec`) with pure white cards, matching the real site's actual white-dominant, cream-for-accents ratio — the first pass over-applied cream everywhere. `--accent-ink` stays dark text (not white) on the orange in both modes: measured contrast is ~2.7:1 for white-on-brand-orange (fails WCAG AA) versus ~7:1 for near-black-on-orange.
- **Sate persona, not just a label.** `SYSTEM_RULES` now opens "You are Sate, Eusate's AI agent... running here as a free, unofficial guide" instead of "You are the Eusate guide" — the model actually introduces itself as Sate, not just a UI caption claiming it. Re-ran the full eval suite after this prompt change (the exact class of change `eval.yml` exists to catch): **69/69, 100%, $0.59** — confirmed the rename didn't regress anything, not assumed.
- **Tabs**, replacing one long scroll: Chat / Key facts / Platforms / News, standard WAI-ARIA tablist pattern (`role="tablist"`/`"tab"`/`"tabpanel"`, arrow-key navigation). All panels stay in the DOM and are toggled via the `hidden` attribute, not conditionally unmounted — the platform pages' SEO value and screen-reader/no-JS access to full content are both preserved. Offer-status banner, legal disclaimer and the lead-gen card stay outside the tabs (always visible, not tab-gated).
- ~~Brand texture: a `.brand-gradient`/`.brand-gradient-text` utility and a `.brand-watermark` logo-bleed treatment in the header and lead-form card~~ — **reverted the same day**, see below.
- Verified visually (mobile/desktop, light/dark, all four tabs clicked through) — no console or page errors. Desktop view now fits in one viewport without scrolling; previously it was a long scroll even before the platform-list rewrite.

**Same-day correction: too loud.** The gradient-on-everything (tabs, badges, "Sate" as gradient text) plus the watermark reads as busy, not premium — confirmed by comparing against a real screenshot of Eusate's actual deployed chat widget (a live customer instance, "GDG Akure"): white-dominant, one flat accent color used only on the send button, plain message bubbles, a small unobtrusive "Powered by Eusate" strip. Reverted to that restraint: `.brand-gradient`, `.brand-gradient-text` and `.brand-watermark` are removed from `globals.css` entirely (not just unused — deleted, so there's no dead CSS or temptation to re-enable it half-thought-out). Active tab, the phase badge and buttons now use the flat `--accent` fill, no gradient. `--canvas` moved to a near-white `#fafaf8` (was `#fff9ec`). The header and lead-form card no longer carry the icon watermark. "Sate" is now plain bold text, not gradient-clipped. The lesson: matching a brand's *reference marketing page* and matching a brand's *actual product UI* are different targets, and for an info/chat tool the product UI is the right one to copy.

## 13. Decisions I need from you (defaults chosen, proceed unless you object)

1. Standalone v1 vs Eusate-as-brain: **default standalone** (section 2).
2. Label: **"Built by Eusate"** until Eusate is the engine.
3. Model: **Sonnet 5** for answers, Haiku 4.5 for ingest.
4. Daily budget cap: **$50/day, agreed**, alerts at 50/80/100%.
5. Facts owner: **you**, fully optional. Verification is your private reliability check; it never blocks the bot and never shows users a warning (section 5).
6. Lead capture: **on, explicit consent, webhook to Eusate**.
7. Repo/folder: **`eusate-dangote-ipo`** (this folder). Git remote is yours to create.
8. Daba: **`unverified`, left out of recommendations** until confirmed (section 11). You flip it.
9. `/admin` access: **single-user login for you**, plus a read-only CSV export for the Eusate team. Tell me if others need logins.
10. Notifications: **daily digest by email; urgent alerts by email + Telegram**. I need from you: recipient email(s), DNS access to `eusate.com` for a verified sender (SPF/DKIM records for the email provider), and a Telegram bot token + your chat ID (2 minutes with @BotFather).
11. Public link **not gated on counsel** (your decision). Disclaimers and behaviour guardrails are the protection; counsel read recommended before any paid promotion.

---

## Appendix A — What Eusate needs for "public agent mode" (later; each item verified in `eusate-be`)

1. **Ticketless public channel.** Model on Playground (`app/v1/playground/serializers.py:167-286`; `ModuleChannel.PLAYGROUND` has no escalation/ticket fields, `response_schema_registry.py:152-157`). Today the socket path always creates a ticket (`app/v1/socket/namespaces/helpdesk/chat.py:394-472`).
2. **Escalation flag.** `AiConfiguration.escalation_enabled` (`app/v1/sate/models.py:66`, migration, `django_repositories/sate.py:350`, `sate/serializers.py:242`) plus early return in `sate_escalate_ticket` (`ticket_state.py:215-256`). Reword the 3 hard-coded "agent will be with you" texts (`message.py:720-726`, `output_validator.py:298`, input-filter block `message.py:654-668`). Prompt-only is unreliable (`custom_prompt` is LOW priority; base prompt says humans are available, `prompts/helpdesk.py:61,83`).
3. **KB automation.** API-key (or service-account) KB writes, **upsert by external id**, and a re-crawl/refresh job. Today: user JWT + 2FA only, duplicates on re-add, link edit doesn't refetch (`django_task_processors/base.py:832-893`), no KB job in beat.
4. **Public-safe access.** Per-org origin allowlist (`OrganisationMeta.DOMAIN` exists but is unused), scoped API keys (no scopes today), socket/REST per-org throttles, socket CORS not `*` (`interfaces/v1/socket.py:46`), HTTP+SSE send-message endpoint.
5. **Validator false positives.** `sate_utils/input_validator.py:63` ("instead of", "from now on", "act as", "disregard the") blocks and escalates natural IPO questions.
6. **Capacity and budget.** Isolated deployment or a load test (4 workers; thread-sensitive `sync_to_async`, `mixins/sate.py:67`, my inference) and a token grant sized for public traffic (beta 20M S8 is roughly 4K turns, inferred).
7. Plan gate: `AI_CUSTOMISATION` (persona/`custom_prompt`) requires L2+/beta (`sate/views.py:375`).

8. **DevSpace (`lab`) specifics** (read from code unless marked inferred; paths under `src/`):
   - `HttpRestFunction` (`app/v1/lab/models.py:27-49`): GET only, `{placeholder}` path/query params, `provided_by` sate or organisation. Auth config is per-org and uses the *end-customer's* login token, not a static key (`tool.py:228-279`).
   - Execution graph `kb_retrieve → assistant → tools → assistant → END` (`sate_utils/entity.py:364-448`). No HTTP timeout, retry, size cap, or SSRF allowlist (`devmode/http_rest.py:464`). Path params `str.format`-ed unencoded (`:477`, inferred injection risk). Errors returned as `repr(e)` (`tool.py:86-98`).
   - Purely model-discretion tool use; `tool_choice` never set (`message.py:767`). Only KB search is forced. Prompt lists tool names only (`prompts/helpdesk.py:10-20`).
   - Plan gate only at create/edit/go-live (`func_config.py:65,96`); Free denied; downgrade suspends newest LIVE functions (`django_task_processors/plan/usage.py:144-157`). Overage $0.50/function on paid plans.
   - Billing: pre-check ignores tools; only the final message's `usage_metadata` is billed (`message.py:804-815`), so the tool-deciding call looks unbilled (inferred).
   - Playground loads DEV functions too (`app/v1/playground/serializers.py:186-193`), which is what makes the private spike possible.

Inferences, not code facts: ~4 concurrent turns, ~5K S8 per turn, `repr(e)` URL leak, path-injection risk, strict-schema breakage from optional params, unbilled tool-deciding call.

## Appendix B — Sources consulted (2026-09-19, secondary; verify before use in `facts/`)

Offer ₦525/share, 4.1B shares, ~₦2.15T, up to 30% greenshoe, min 10 shares (₦5,250), opens 14 Sep, closes 13 Oct, NGX listing expected Nov: Daba tracker, Nairametrics, Vanguard, Tribune, MyStocks, Channels TV. Platform lists: Technext (18 platforms), Legit.ng, Nairametrics. SEC circular (sec.gov.ng, 14 Sep 2026): names no receiving agents, warns investors to use official channels only. Daba guide (dabafinance.com, 10 Sep 2026): claims access via Coronation. Official site `ipo.dangote.com` is JS-rendered (plain fetch returned only a headline), hence Playwright in the watcher.
