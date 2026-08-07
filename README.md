# HireLens — AI Video Interview Platform

HireLens conducts structured video interviews with an AI interviewer. It generates role-specific questions, reads them aloud, records the candidate on camera, transcribes spoken answers live in the browser, scores every answer for **accuracy, relevance and depth**, and returns a **hire / borderline / no-hire** decision with a full report. The five most recent interviews are kept with video, transcript and scores.

Frontend: **React (Vite)** · Backend: **Node.js microservices** · AI: **Claude API**

## Quick start (2 minutes)

Requires Node.js 20+.

```bash
npm install
cp .env.example .env          # add ANTHROPIC_API_KEY, or set MOCK_AI=true for a free demo
                              # .env is auto-loaded by all services; restart after editing it
npm run dev                   # starts gateway + ai-service + interview-service + Vite
```

Open http://localhost:5173. To try it with **zero AI spend**, set `MOCK_AI=true` in the environment before `npm run dev`.

Production build:

```bash
npm run build                 # builds frontend/dist, served by the gateway
npm start                     # gateway :8080 serves API + app
```

Docker (all three services, isolated, with a persistent volume for history):

```bash
npm run build
ANTHROPIC_API_KEY=sk-... docker compose up --build
```

Tests: `npm test` (unit) and `sh scripts/smoke.sh` (boots all services and exercises every endpoint end-to-end).

## Architecture

```
Browser (React)
  camera + mic  -> MediaRecorder  -> video saved in IndexedDB (client-side)
  speech        -> Web Speech API -> live transcript (free, zero tokens)
        |
        v  /api/*
┌───────────────┐     ┌────────────────────┐
│    gateway    │────>│     ai-service     │──> Claude API
│ :8080         │     │ :8081  questions + │    (only service that
│ helmet, CORS, │     │ batched evaluation │     spends tokens)
│ rate limits,  │     └────────────────────┘
│ static app    │     ┌────────────────────┐
│               │────>│ interview-service  │──> JSON store (atomic writes)
└───────────────┘     │ :8082  history ≤ 5 │    swap for Postgres/Mongo
                      └────────────────────┘
```

Each service is independently deployable and communicates only over HTTP — scale the ai-service horizontally under load without touching the others. The history store is a single module (`store.js`) with a four-function contract (`list/get/save/remove`); replacing it with a real database changes nothing else.

Interview videos are stored in the candidate's browser (IndexedDB), keyed by interview id — the server stays stateless and storage-free. Teams that need shared video access can upload the blob to S3/GCS after `videoStore.save` (same interface).

## Why the AI cost is minimal

1. **One batched evaluation call per interview.** All answers are scored in a single request, so system-prompt and context tokens are paid once — evaluating 8 answers costs roughly the same as 1.
2. **Free transcription and speech.** Answer capture uses the browser's Web Speech API and questions are spoken with browser TTS. No audio ever hits a paid model.
3. **Question caching.** Question sets are cached per role/level/skills for 24h — interviewing ten React candidates in a day generates questions once.
4. **Cheapest fast model by default** (`claude-haiku-4-5`), compact JSON-only prompts, and hard `max_tokens` ceilings. Override `AI_MODEL` if you want a larger model — see current model pricing at https://docs.claude.com/en/docs/about-claude/models.
5. **Tight rate limit on AI routes** at the gateway (20/min) so a misbehaving client can't run up a bill, and `MOCK_AI=true` for demos, CI, and load testing at zero cost.

Typical spend per 5-question interview: **one small generation call (often cached) + one evaluation call** — a few thousand tokens total on the cheapest tier.

## API

All routes pass through the gateway; interview routes require an `x-user-id` header (the frontend generates an anonymous per-browser id).

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/ai/questions` | Generate questions `{role, level, skills[], count, language}` |
| POST | `/api/ai/evaluate` | Batch-score all answers, return decision |
| POST | `/api/interviews` | Save transcript + evaluation (prunes to newest 5) |
| GET | `/api/interviews` | List history (metadata + scores) |
| GET | `/api/interviews/:id` | Full record |
| DELETE | `/api/interviews/:id` | Remove one interview |

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required unless `MOCK_AI=true` |
| `AI_MODEL` | `claude-haiku-4-5` | Any Claude model id |
| `MOCK_AI` | `false` | Full product with zero AI spend |
| `MAX_HISTORY` | `5` | Interviews kept per user |
| `DATA_DIR` | `./data` | interview-service storage path |
| `CORS_ORIGIN` | `*` | Lock to your domain in production |

## Speech recognition (ASR)

Answers are transcribed by a **dual-engine ASR pipeline** — accurate in every modern browser, at zero token cost:

1. **Whisper on-device (authoritative).** OpenAI's Whisper model runs in the candidate's browser via transformers.js in a Web Worker (WebGPU when available, WASM otherwise). When the candidate finishes speaking, the recorded answer audio is transcribed locally. Three quality tiers are selectable at setup: tiny (~40 MB, fastest), base (~80 MB, default), small (~250 MB, max accuracy). The model downloads once and is cached by the browser; audio never leaves the device.
2. **Live captions (assist).** Where the Web Speech API exists (Chrome/Edge/Safari), words appear live while speaking. The Whisper transcript replaces the captions on finish. If neither engine is available, the candidate can type — the interview never blocks.

The transcription language follows the interview language selected at setup (Whisper supports 90+ languages). The Whisper WASM runtime is bundled and served from the app itself; model weights load from the Hugging Face CDN on first use.

Even higher accuracy options (swap-in, no code restructuring): raise the tier to `whisper-small`, or point `WHISPER_MODELS` in `frontend/src/hooks/useWhisper.js` at a larger model, or add a server-side ASR microservice with `whisper-large-v3` for contact-center-grade accuracy.

## Taking it to a wider market — production checklist

The codebase is structured so each of these is a swap, not a rewrite:

- **Auth:** replace the anonymous `x-user-id` header with JWT/OAuth verified at the gateway (one middleware).
- **Database:** swap `interview-service/src/store.js` for Postgres; the service API is unchanged. Raise `MAX_HISTORY` per pricing tier.
- **Video at scale:** upload recordings to S3/GCS with signed URLs instead of IndexedDB.
- **Compliance:** recording consent screens per jurisdiction, retention policies, and human review of AI recommendations. AI hiring tools are regulated in several markets (e.g. NYC Local Law 144, EU AI Act) — treat the AI decision as advisory input to a human recruiter, which is how the report is worded.
- **Observability:** each service exposes `/health`; add your log shipper and metrics of choice.
