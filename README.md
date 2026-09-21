# PlantPal — Jev-Gated Plant Chat

> PlantPal demonstrates Jev as a System One decision layer in front of a domain-specific LLM. Every user message is evaluated for domain relevance before an expensive generative model is invoked.

```
                    ┌──────────────┐
User message ──────►│     Jev      │
                    │    Intent    │
                    └──────┬───────┘
                           │
                    ┌──────┴──────┐
                    │             │
                  ALLOW         BLOCK
                    │             │
                    ▼             ▼
         Plant LLM (Nemotron)  Local reply
                    │
                    ▼
                  Answer
```

## Why Jev

A domain chatbot should not spend a large generative call on every off-topic
prompt. Jev (`POST https://api.typesafe.ai/v1/systemone`, Bearer auth, pinned
`JEV_MODEL=jev-1.13.0`) returns calibrated, typed decisions in ~70–500ms with
free output tokens — a cheap gate in front of the plant LLM. Code keeps control:
Jev answers, `lib/routing.ts` decides.

## Typed decision (one Jev call, one Choice)

Jev returns a single **Choice `intent`** — exactly one of `plant_health`,
`plant_care`, `plant_identification`, `plant_science`, `gardening`,
`app_support`, `other_plant`, `off_topic`, each with a rubric in
`lib/jev/classify.ts`. The **top label rules at any confidence**; its confidence
and the full probability distribution are exposed in the UI and recorded for
eval. Software or app-building tasks are `off_topic` even when plant-flavored
(e.g. building an app that gives plant advice); only questions about using
PlantPal itself are `app_support`.

State sent to Jev is concise (`lib/jev/classify.ts:buildJevState`): app purpose,
allowed-domain list, last 4 conversation messages, current message. No UI state,
timestamps, or browser metadata.

## Routing (`lib/routing.ts`)

```text
intent == off_topic → BLOCK (local reply, no LLM)
otherwise            → ALLOW (call plant LLM)
```

- ALLOW: `answerPlantQuestion` with chat history (Jev's decision is not forwarded).
- BLOCK: deterministic local string, LLM never called.
- No thresholds, no fallback classifier by design — one Choice, top label rules.
  A weak `off_topic` top (e.g. 45%) still blocks; eval tracks these as weak blocks.
- Jev error/malformed/missing key → `jevStatus: "error"` → fails closed to
  BLOCK (no LLM call, error logged server-side only). Gate errors are never
  exposed to the client; `/api/chat` returns 400/403/413/429/502 without
  leaking keys or provider text. Both chat routes are per-IP rate-limited.

## Evaluation

- Dataset: `eval/dataset.json` (seed ~31: clear relevant / clear irrelevant /
  borderline incl. conversational follow-ups like “What about once a week?” and
  the plant-flavored app-building case).
  Labels are frozen before running; never relabel to agree with Jev.
- Runner: `npm run eval` (needs `TYPESAFE_API_KEY`; live calls, kept out of
  `npm test`). Reports routing accuracy, recall/precision, **false-block rate**
  (primary), false-allow rate, intent accuracy, weak-block count, avg/p50/p95
  latency. Writes `eval/results.json`, rendered at `/eval` with misclassification
  and weak-block tables.
- Unit tests: `npm test` (Vitest, all external APIs mocked): label routing
  (off_topic→block incl. weak tops, all plant intents→allow), Jev-fail→allow,
  block-never-calls-LLM, allow-calls-once, history inclusion, no key leakage.

## Threshold calibration

There is nothing to tune by default — routing is pure top-label. If eval shows
weak-top blocks costing real plant questions, the documented TypeSafe alternative
is confidence-gating (block only when `off_topic` tops with confidence ≥ T).
Current behavior is strict by decision; benchmark numbers go here once measured.

## Limitations

- Follow-up understanding is limited to the last 4 messages.
- Borderline plant-adjacent prompts (pet safety, “wood ash”, room temperature)
  are the main error source; with no fallback band they resolve to a hard
  allow/block at the threshold.
- Answers come from `nvidia/nemotron-3-ultra-550b-a55b:free` via OpenRouter;
  without `LLM_API_KEY` the app runs in offline demo mode (template answers).
- No auth, DB, RAG, image recognition, or notifications by design — this is a
  routing experiment in a chat shell.

## Setup

```bash
npm install
cp .env.example .env   # fill TYPESAFE_API_KEY, LLM_API_KEY (OpenRouter key)
npm run dev            # http://localhost:3000
npm test               # mocked unit tests
npm run eval           # live Jev benchmark (costs API calls)
```

Env: `TYPESAFE_API_KEY` (server-only), `JEV_MODEL=jev-1.13.0`, `LLM_API_KEY`
(OpenRouter key, server-only), `LLM_MODEL`
(default `nvidia/nemotron-3-ultra-550b-a55b:free`), `LLM_BASE_URL`
(default `https://openrouter.ai/api/v1`), `SITE_URL` (OpenRouter referer header).
The LLM layer (`lib/llm/client.ts`) stays provider-agnostic; the Jev layer uses
the official `@typesafe-ai/sdk` server-side only.
