# Eusate x Dangote Refinery IPO guide

Public, unofficial Q&A guide for the Dangote refinery IPO, built by Eusate. Standalone product: it is not part of the Eusate helpdesk backend. The plan, decisions and rationale are in [PLAN.md](PLAN.md). Read that first.

## Run it locally

```bash
docker compose up -d db          # Postgres on localhost:5544
cp .env.example .env.local       # then edit; ANSWER_MODE=mock works without an API key
npm install
npm run db:migrate
npm run dev                      # http://localhost:3000
```

Live answers need `ANTHROPIC_API_KEY` and `ANSWER_MODE=live`.

## Where things live

| Path | What |
|---|---|
| `facts/ipo.yaml`, `facts/platforms.yaml` | Canonical facts and platform directory. Human-verified, validated at build time. Edit, merge, deploy. |
| `facts/evergreen/*.md`, `facts/eusate.md` | Guides the bot draws on. `reviewed: false` until a human has read them. |
| `src/lib/prompt.ts` | System rules and how facts become the cached context. |
| `src/lib/engine/` | `ChatEngine` seam: `DirectEngine` (Claude), `MockEngine` (local). Eusate can be added here later. |
| `src/lib/chat/service.ts` | One chat turn: redact, budget check, persist, stream, log. |
| `src/app/api/` | `chat` (SSE), `track`, `health`, `v1/facts`, `v1/platforms`. |

## Commands

`npm test` (unit tests) · `npm run typecheck` · `npm run lint` · `npm run build` · `npm run knowledge` (validate facts and regenerate `src/generated/knowledge.json`).

An invalid facts file fails the build, so it cannot deploy.
