# Coldbrew AI — Build Progress

Single source of truth for **what is done, what is in progress, and what comes next**. Update after every meaningful chunk of work so anyone (you, a teammate, or a future agent) can pick up from exactly the right place.

**Last updated:** 2026-04-24 PT
**Current phase:** Phases 0 – 6 complete in their first end-to-end form · Phase 6.5 reply tracking shipped · Phases 7–9 pending
**Target Vercel URL:** pending Vercel project deployment / assigned production domain
**Changelog:** see [§ Changelog](#changelog) below for a timestamped log of every code change.

Legend: ✅ done · 🟡 in progress · ⏳ pending · 🚧 blocked on external input

---

## Changelog

Append newest entries at the top. Each entry: ISO timestamp, short title, one
paragraph of "what / why", and a files list. Keep entries atomic — one
meaningful change per entry.

### 2026-04-24 — Reply tracking (Phase 6.5)

**What.** Each project now tracks replies to messages sent through Coldbrew.
After a recipient is sent, we capture the Gmail thread id; a Vercel cron
hits `/api/cron/check-replies` every 15 minutes, polls each tracked thread
via `gmail.users.threads.get`, and counts incoming messages (any message
without the `SENT` or `DRAFT` label). When a reply is detected we store
`repliedAt`, `replyCount`, `lastReplyAt`, `lastReplyFrom`, and a 280-char
`lastReplySnippet`. The campaign page surfaces this with a "Replied"
chip on each recipient card, a reply-snippet block in the expanded view,
a `N replies` pill in the panel header, and a "Refresh replies" button
that force-polls (bypassing the 10-min per-row throttle).

**Why.** Users had no way to tell from inside Coldbrew which cold emails
had landed. Bouncing back to Gmail to check breaks the dashboard loop.

**How.**
- New migration `20260423120000_reply_tracking` adds idempotent columns +
  indexes to `RecipientDraft` (`providerThreadId`, `repliedAt`,
  `replyCount`, `lastReplyAt`, `lastReplyFrom`, `lastReplySnippet`,
  `lastCheckedAt`).
- `MailProvider.createDraft` and `sendMessage` now return `providerThreadId`;
  collective send/push and per-row send persist it.
- New `web/src/lib/replies/{gmail-threads,check}.ts` module groups work by
  ProviderAccount (one access-token decrypt per inbox), throttles to a
  10-minute recheck window unless `force: true`, and is silent on per-row
  Gmail hiccups (the next run retries).
- `vercel.json` (new) registers the 15-minute cron; the route checks
  `Authorization: Bearer ${CRON_SECRET}` when set.
- `RecipientView`/`RecipientClientJson` carry the new reply fields to the
  client; `RecipientCard` renders a "Replied" chip + snippet block;
  `RecipientPanel` adds the stats pill and refresh action.

**Files.**
- `web/prisma/migrations/20260423120000_reply_tracking/migration.sql`
- `web/prisma/schema.prisma`
- `web/src/lib/providers/{types,gmail}.ts`
- `web/src/app/api/campaigns/[id]/{send,push,replies}/route.ts`
- `web/src/app/api/campaigns/[id]/recipients/[rid]/send/route.ts`
- `web/src/lib/replies/gmail-threads.ts`, `web/src/lib/replies/check.ts`
- `web/src/app/api/cron/check-replies/route.ts`, `web/vercel.json`
- `web/src/lib/env.ts` (adds `CRON_SECRET`)
- `web/src/lib/campaigns/recipient-json.ts`
- `web/src/components/campaign/{types,recipient-card,recipient-panel}.tsx`

**Operational.** After deploy:
1. Apply the migration to Supabase prod (direct connection, not pooler).
2. Set `CRON_SECRET` in Vercel project envs.
3. Vercel will start invoking `/api/cron/check-replies` at the configured
   schedule on the next deploy.

### 2026-04-23 — Vercel-ready auth/OAuth redirects

**Problem.** Auth and Gmail OAuth were code-complete, but several deploy-facing
settings and help strings still pointed to localhost (`3000` / `3002`). That
made a Vercel deployment likely to redirect back to the developer machine or
show the wrong Google Cloud callback URI. A guessed
`coldbrew-ai.vercel.app` URL returned `DEPLOYMENT_NOT_FOUND`, so the app must
use the actual Vercel-assigned production domain after deployment.

**Fix.**
- Removed the guessed Vercel URL from runnable local config and changed deploy
  examples to use `https://your-vercel-project.vercel.app`.
- Gmail OAuth start/callback redirects now derive the app origin from the
  incoming request instead of falling back to `localhost:3002` or relying on a
  guessed production URL.
- Settings Gmail error copy now displays the current deployed origin for the
  required callback URI.

**Files.**
- `web/src/app/api/oauth/google/start/route.ts`
- `web/src/app/api/oauth/google/callback/route.ts`
- `web/src/components/settings/connect-gmail-section.tsx`
- `web/.env.example`, `web/.env.local`, `README.md`, `PROGRESS.md`

### 2026-04-20 13:55 PT — `sent` enum: idempotent migration + `RecipientStatus.sent` + `postinstall`

**Problem.** Some machines still threw `Invalid value for argument 'status'.
Expected RecipientStatus` after Gmail **Send** — usually DB enum missing
`sent`, stale Prisma client, or dev server cache.

**Fix.**
- New migration `20260420140000_ensure_recipient_status_sent`: `DO $$ … IF
  NOT EXISTS (pg_enum) … ALTER TYPE ADD VALUE 'sent'` (idempotent).
- Send routes use **`RecipientStatus.sent`** from `@prisma/client` instead of
  a bare string.
- **`postinstall`: `prisma generate`** in `web/package.json` so `npm ci`
  always refreshes the client after pulls.

**Files.**
- `web/prisma/migrations/20260420140000_ensure_recipient_status_sent/migration.sql`
- `web/src/app/api/campaigns/[id]/send/route.ts`,
  `web/src/app/api/campaigns/[id]/recipients/[rid]/send/route.ts`
- `web/package.json`

---

### 2026-04-20 13:45 PT — Gmail outbound: collective send, per-recipient Send, push without Approve, Prisma `sent` enum order

**Problem / goals.** Users needed (1) real **send** from Coldbrew, not only
Gmail drafts; (2) **no mandatory Approve** before save/send; (3) **per-row
Send** next to each recipient; (4) after enabling Gmail API, **`status:
sent`** updates failed because PostgreSQL appends new enum values at the
**end** of the type — schema had `pushed, sent, error` but DB order was
`pushed, error, sent`, so Prisma rejected `"sent"`.

**Fix / features.**
- **`RecipientStatus.sent`** + migration `20260420133000_recipient_status_sent`;
  schema enum order corrected to **`… pushed, error, sent`** to match
  `ALTER TYPE … ADD VALUE` append semantics.
- **`gmailProvider.sendMessage`** — `POST …/users/me/messages/send` (same MIME
  builder as drafts). Batch **`POST /api/campaigns/:id/send`** and single
  **`POST /api/campaigns/:id/recipients/:rid/send`**.
- **`POST /api/campaigns/:id/push`** now targets **`drafted` OR `approved`**
  (Approve optional). Action bar: **Save {n} to Gmail Drafts**, **Send all
  (n) now** (includes **`pushed`** for send batch), clearer copy + confirm
  modals; OAuth callback fallbacks use port **3002**.
- **Recipient card:** red **Send** + confirm overlay; **`CampaignWorkspace`**
  passes **`providerAccountId`** into **`RecipientPanel`**. Settings Gmail
  errors map to clearer query codes (`redirect_uri_mismatch`, etc.).
- **Project naming:** new-project dialog name, list **Rename**, detail
  **`ProjectNameHeader`**; `README` / local **`.env.example`** comments for
  **3002** redirects where relevant.

**Files (high level).**
- `web/prisma/schema.prisma`, `web/prisma/migrations/20260420133000_*`
- `web/src/lib/providers/gmail.ts`, `types.ts`
- `web/src/app/api/campaigns/[id]/send/route.ts`,
  `web/src/app/api/campaigns/[id]/recipients/[rid]/send/route.ts`
- `web/src/app/api/campaigns/[id]/push/route.ts`
- `web/src/components/campaign/campaign-action-bar.tsx`,
  `recipient-card.tsx`, `recipient-panel.tsx`, `campaign-workspace.tsx`
- `web/src/app/api/oauth/google/callback/route.ts`,
  `connect-gmail-section.tsx`
- `web/src/components/campaign/new-project-button.tsx`,
  `campaigns-list.tsx`, `project-name-header.tsx`,
  `web/src/app/(dashboard)/campaigns/page.tsx`,
  `campaigns/[id]/page.tsx`
- `web/.env.example` (redirect comment ports)

---

### 2026-04-20 11:20 PT — Recipients UI: roomier expand + draft body + paste area

**Problem.** When expanding a recipient, the contact/draft panel felt cramped:
the paste textarea and draft body were short enough that users did not
realize they needed to scroll, and the overall card height capped useful
space.

**Fix.**
- `RecipientCard` expanded state now uses a full-width tinted panel with
  clear **Contact** / **Email draft** sections, `h-11` inputs, and a large
  read-mode body preview (`min-h-[300px]`, up to `min(68vh, 640px)` scroll)
  plus explicit copy that the white area scrolls. Edit mode uses a tall
  `min-h-[min(52vh,480px)]` resizable textarea. Chevron on Expand/Collapse
  for affordance; local state syncs from `recipient` via `useEffect`.
- `RecipientPanel` card uses `min-h-[560px]` and `h-[min(92vh,760px)]`
  instead of a fixed `520px`. Paste mode textarea is taller (`min-h` /
  `resize-y`) and `text-sm`.

**Files.**
- `web/src/components/campaign/recipient-card.tsx`
- `web/src/components/campaign/recipient-panel.tsx`

---

### 2026-04-20 10:40 PT — UX gate: briefing can be filled manually · action bar explains itself

**Problem.** A real user got stuck today: Gemini's briefing chat replied with
a sample email body instead of emitting the structured briefing JSON, so
extraction silently failed and the Campaign row ended up with
`briefing = null`. That meant the *Generate drafts* button stayed disabled
forever with no visible reason — the user assumed the whole pipeline was
broken and that it might need Google OAuth to work.

**Fix.**
- `BriefingSummary` now always renders, not just when a briefing exists.
  When `briefing === null` it starts from a `DEFAULT_BRIEFING` and is
  clearly labelled "Briefing — not set yet" with a `CardDescription`
  telling the user they can either finish the chat OR fill it in manually.
  Saving the first time unlocks generation.
- `CampaignActionBar` computes a concrete `generateBlockedReason` string
  and surfaces it both in the button's `title` tooltip AND as a
  `"Can't generate yet: …"` line below. The reasons cover the two real
  cases (briefing missing, no recipients).
- The *Create drafts in inbox* button similarly shows a tooltip explaining
  whether it's blocked on "no approved drafts" or "no connected inbox".
- The heavy-handed "Connect an inbox first" Card at the top of the campaign
  page is replaced by a softer amber banner that makes clear you CAN
  generate + review drafts locally without Gmail — connection is only
  needed for the last step.

**Files.**
- `web/src/components/campaign/briefing-summary.tsx` — null-safe, with
  DEFAULT_BRIEFING and required-field validation on save.
- `web/src/components/campaign/campaign-workspace.tsx` — unconditionally
  renders `<BriefingSummary />`; drops the now-redundant `readyToGenerate`
  memo and its prop pass-through.
- `web/src/components/campaign/campaign-action-bar.tsx` — takes `briefing`
  instead of `readyToGenerate`, computes reason strings, adds tooltips +
  visible footnotes for both CTAs.
- `web/src/app/(dashboard)/campaigns/[id]/page.tsx` — replaces the blocker
  Card with an info banner; drops unused `Card*` imports.

---

### 2026-04-20 10:13 PT — Flash-Lite-proof placeholder scrub + honorific-aware validator

**Problem.** When a recipient profile has no specific research details,
Gemini 2.5 Flash-Lite stubbornly inserts `[mention a specific area…]`
bracketed hints in the draft body — even after retries with stronger
prompts. My original validator regex (`[A-Z_]` start) also missed
lowercase-starting hints, and its "first name" check treated `Prof.` as
the recipient's first name.

**Fix.**
- Widened validator regex to match any bracketed hint containing
  whitespace or a lowercase letter (keeps pure-ACRONYM like `[AI]`/`[MIT]`
  safe), and split mustache vs bracket checks so they compose.
- Added an HONORIFICS set (Prof./Dr./Mr./Ms./…) — strip before picking
  `firstName` for the "name-in-body" check.
- New `src/lib/llm/scrub.ts` module. Runs AFTER the validator. If a
  sentence still contains a placeholder, delete the whole sentence and
  preserve paragraph breaks. Last line of defence against a stubborn
  model. Used by the draft runner right before DB write.
- Strengthened `buildDraftPrompt` — when the recipient has no specific
  research info the prompt now includes an example "fall back to title +
  organization" sentence using the actual values, not `[specific paper]`.

**Files.**
- `web/src/lib/llm/validators.ts` — widened regex, honorific-aware
  firstName extraction.
- `web/src/lib/llm/scrub.ts` — new.
- `web/src/lib/llm/scrub.test.ts` — 5 new tests (+31 existing = 36 green).
- `web/src/workers/draft-runner.ts` — runs `scrubPlaceholders(draft.body)`
  before persisting.
- `web/src/lib/llm/prompts.ts` — concrete fallback-sentence example
  injected into the writer prompt.

---

### 2026-04-20 08:30 PT — Fix 429 by defaulting to Gemini 2.5 Flash-Lite (50× more free quota)

**Problem.** User's account hit Gemini free-tier daily quota at 20 RPD on
`gemini-2.5-flash`. Also, 2.5 Pro's free-tier quota is 0 (Google pulled it
late 2025).

**Fix.**
- Both fast and strong tiers now default to `gemini-2.5-flash-lite`
  (~1000 RPD free quota). Quality is near-identical for 100–200-word
  cold emails. Users with a paid key can override back to `gemini-2.5-pro`
  by setting `GEMINI_MODEL_STRONG`.
- Added `humaniseGeminiError()` — turns verbose SDK error payloads into
  short, actionable messages. 429 → tells user the retry seconds AND how
  to switch model in `.env.local`. 401/403 → "check GOOGLE_API_KEY".
  Others → truncated sanitised message.
- Also fixed a fire-and-forget race condition: `POST /recipients` was
  returning `status: "pending"` to the client because enrichment ran
  asynchronously. Now, when running inline (dev mode without queue
  workers), we await the jobs and return the post-enrichment row so the
  UI never has to poll for status.

**Files.**
- `web/src/lib/llm/gemini.ts` — default model swap, humaniseGeminiError,
  stricter typing on stream response.
- `web/.env.example` — commented note about Flash-Lite vs Flash vs Pro.
- `web/src/app/api/campaigns/[id]/recipients/route.ts` — await inline
  enrichment jobs, re-fetch rows before returning.

---

### 2026-04-20 01:22 PT — Briefing extractor accepts three formats (sentinel / markdown fence / bare JSON)

**Problem.** Gemini wraps the final briefing JSON in a
<code>```json</code> markdown fence by default, ignoring our
`<briefing_json>` sentinel. Extraction silently failed, `Campaign.briefing`
never populated, and no UI feedback was given.

**Fix.** `extractBriefing()` now tries three patterns in order: sentinel →
markdown fence → any bare `{...}` containing `"purpose_category"`. The
first that parses and passes the Zod schema wins. Preserves the existing
5 unit tests and remains schema-safe.

**Files.**
- `web/src/lib/llm/briefing-extract.ts`

---

### 2026-04-20 00:48 PT — Real Gemini adapter ships, factory prefers it

**Problem.** Up to this point the app ran against the Stub adapter only.

**Fix.**
- `@google/genai` SDK installed.
- New `src/lib/llm/gemini.ts` — implements `ModelAdapter` for both
  streaming and non-streaming calls, handles Gemini's `role: "model"`
  convention and dedicated `systemInstruction` field. `thinkingConfig`
  explicitly set to `{ thinkingBudget: 0 }` — by default 2.5-series
  models burn output tokens on silent reasoning, leaving our responses
  truncated. Disabling it reclaims ~80% of output budget for short email
  tasks.
- `getModel()` priority order: **Gemini → Anthropic → OpenAI → Stub**.
  Swap by setting/clearing env vars — no code change.
- README + PROGRESS updated with the AI Studio key-creation walkthrough.

**Files.**
- `web/src/lib/llm/gemini.ts` — new.
- `web/src/lib/llm/index.ts` — factory rewritten.
- `web/src/lib/llm/types.ts` — added `"gemini"` to vendor union.
- `web/src/lib/env.ts` — `GOOGLE_API_KEY`, `GEMINI_API_KEY` (alias),
  `GEMINI_MODEL_FAST`, `GEMINI_MODEL_STRONG`.
- `web/.env.example` — LLM priority order documented.
- `README.md` — "Enabling a real LLM (Gemini — recommended for dev)"
  section.

---

### 2026-04-20 00:00 PT — Port 3002 migration (localhost:3000 collision with Grafana)

**Problem.** After signup Auth.js kept redirecting to
`http://localhost:3000/…` — which on the user's machine is Grafana, not
our app. Root cause: `AUTH_URL` was hard-coded to 3000 in `.env.local`.

**Fix.** Switched everything to port 3002.

**Files.**
- `web/.env.local` — `AUTH_URL`, `GMAIL_OAUTH_REDIRECT_URI` → `:3002`.
- Dev command documented as `npx next dev -p 3002`.

---

### Historical snapshots

Earlier today we also landed (each verified with `typecheck` + `lint` +
`test` + `build`):
- **2026-04-19 ~23:45 PT** — whole project scaffolded from empty repo
  through Phases 0–6 in six waves (setup, LLM infra, campaign CRUD,
  briefing chat, recipients+enrichment, drafts, push-to-inbox, settings/
  compliance). Details in the Phase tables below.

---

## At a glance

The whole spec is wired end-to-end with **deterministic stubs** in place of every external dependency so the app runs today with zero paid API keys. Each stub has a real-adapter sibling that activates the moment its env var is filled in.

**Right now, against a local database, the following flow runs:**

1. Sign up → sign in (email + password with argon2id)
2. Create a new campaign
3. Chat with the briefing interviewer (streaming SSE, stub model)
4. Paste / upload / manually add recipients (email, `Name <email>`, LinkedIn, CSV)
5. Recipients auto-enriched by the stub provider (email → org heuristics, LinkedIn URL → name)
6. Click **Generate drafts** → per-recipient subject + body generated with quality validators
7. Inline edit + **Regenerate with instruction**, approve drafts
8. Click **Create drafts in inbox** → confirmation modal → Gmail drafts created (stubbed until OAuth client is connected)
9. Export my data as JSON; delete my account (revokes provider grants)
10. Any recipient (non-user) can hit `/data-request` to request deletion/access

**Test coverage**: 31 unit tests across crypto, briefing extraction, recipient parsing, draft validators.

**CI signals**: `npm run typecheck` ✓  ·  `npm run lint` ✓  ·  `npm run test` ✓  ·  `npm run build` ✓ (27 routes)

---

## What the user still needs to do (external prerequisites only)

| Dependency | Why | Env vars to fill | Behaviour before fill |
| --- | --- | --- | --- |
| **Google Cloud OAuth clients (x2)** | SSO login + Gmail drafting grant | `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `GMAIL_OAUTH_CLIENT_ID`, `GMAIL_OAUTH_CLIENT_SECRET` | Login still works with email+password; Connect Gmail button errors out |
| **Google Gemini API key** (easiest — free tier, no credit card) | Real briefing chat + real draft writer | `GOOGLE_API_KEY` | Stub adapter returns deterministic scripted replies |
| **Anthropic API key** (best quality, paid) | Same as above | `ANTHROPIC_API_KEY` | (see above) |
| **OpenAI API key** (alternative, paid) | Same as above | `OPENAI_API_KEY` | (see above) |
| **Hunter.io** (optional) | Better per-recipient research | `HUNTER_API_KEY` | Stub derives org from email domain |
| **Proxycurl** (optional) | LinkedIn profile data | `PROXYCURL_API_KEY` | LinkedIn URLs fall back to name-from-slug only |
| **Apollo.io** (optional, not yet integrated) | B2B enrichment | `APOLLO_API_KEY` | n/a yet |

Step-by-step OAuth client creation is in `README.md`.

---

## Phase 0 — Setup ✅

| Item | Status | Key files |
| --- | :---: | --- |
| Next.js 14 scaffold (App Router, TS, Tailwind, ESLint, `src/`) | ✅ | `web/` |
| Runtime deps (Prisma 5, Auth.js v5, BullMQ, ioredis, Anthropic/OpenAI, googleapis, nodemailer, …) | ✅ | `web/package.json` |
| Dev deps (Vitest 2, Prettier, tsx, testing-library, jsdom) | ✅ | `web/package.json` |
| shadcn/ui base (Button, Input, Label, Card) + Tailwind theme vars | ✅ | `web/src/components/ui/*`, `web/src/app/globals.css` |
| Prisma schema covering all Section 11 tables (+ Auth.js tables) | ✅ | `web/prisma/schema.prisma` |
| Initial Prisma migration applied | ✅ | `web/prisma/migrations/20260420070507_init/` |
| Prisma client singleton + Zod env loader | ✅ | `web/src/lib/db.ts`, `web/src/lib/env.ts` |
| Envelope encryption (AES-256-GCM + DEK-per-record + KMS hook) | ✅ | `web/src/lib/crypto.ts` + 7 unit tests |
| Logger stub | ✅ | `web/src/lib/logger.ts` |
| Provider interface | ✅ | `web/src/lib/providers/types.ts`, `web/src/lib/providers/index.ts` |
| Docker Compose for Postgres 16 + Redis 7 | ✅ | `docker-compose.yml` |
| `.env.example` fully documented | ✅ | `web/.env.example` |
| GitHub Actions CI (lint + typecheck + test + build) | ✅ | `.github/workflows/ci.yml` |
| Next.js config with `serverComponentsExternalPackages` | ✅ | `web/next.config.mjs` |

---

## Phase 1 — Auth & Provider Connection ✅ (code complete; 🚧 live validation pending Google Cloud keys)

| Item | Status | Key files |
| --- | :---: | --- |
| Auth.js v5 edge/node split (middleware works without argon2) | ✅ | `web/src/lib/auth.config.ts`, `web/src/lib/auth.ts`, `web/src/middleware.ts` |
| Email/password signup with argon2id + Zod | ✅ | `web/src/app/api/auth/signup/route.ts` |
| Credentials login, Google SSO provider scaffolded | ✅ | `web/src/lib/auth.ts` |
| Gmail provider OAuth (PKCE, state, token exchange, refresh, revoke) | ✅ | `web/src/lib/providers/google-oauth.ts` |
| Gmail provider adapter (createDraft with nodemailer MIME) | ✅ | `web/src/lib/providers/gmail.ts` |
| Short-lived OAuth session (cookie-backed) | ✅ | `web/src/lib/oauth-session.ts` |
| `/api/oauth/google/{start,callback,disconnect}` | ✅ | `web/src/app/api/oauth/google/*` |
| Transparent access-token refresh with envelope re-encrypt on rotation | ✅ | `web/src/lib/providers/tokens.ts` |
| Landing / Sign in / Sign up / Dashboard / Settings pages | ✅ | `web/src/app/(auth|dashboard)/**/page.tsx` |
| Connect Gmail / Disconnect UI | ✅ | `web/src/components/settings/connect-gmail-section.tsx` |
| Live E2E Gmail OAuth test | 🚧 | Needs Google Cloud credentials |
| Password reset flow | ⏳ | Depends on transactional email provider |
| Rate limiting on auth endpoints | ⏳ | Ship with Redis-backed rate-limiter in later phase |

---

## Phase 2 — Briefing chat ✅

| Item | Status | Key files |
| --- | :---: | --- |
| `ModelAdapter` vendor-agnostic interface | ✅ | `web/src/lib/llm/types.ts` |
| Gemini adapter (streaming + structured JSON) — **default when `GOOGLE_API_KEY` is set** | ✅ | `web/src/lib/llm/gemini.ts` |
| Anthropic adapter (streaming + structured) | ✅ | `web/src/lib/llm/anthropic.ts` |
| OpenAI adapter (streaming + structured) | ✅ | `web/src/lib/llm/openai.ts` |
| Deterministic Stub adapter (no-key dev mode) | ✅ | `web/src/lib/llm/stub.ts` |
| Adapter factory with priority `Gemini → Anthropic → OpenAI → Stub` | ✅ | `web/src/lib/llm/index.ts` |
| Briefing / draft prompt templates with version tags | ✅ | `web/src/lib/llm/prompts.ts` |
| Zod schemas for briefing + draft JSON (+ purpose taxonomy) | ✅ | `web/src/lib/llm/schemas.ts` |
| Briefing extraction + stripping helpers | ✅ | `web/src/lib/llm/briefing-extract.ts` + 5 tests |
| SSE helper (generic) | ✅ | `web/src/lib/sse.ts` |
| `POST /api/campaigns/:id/briefing/chat` streaming endpoint | ✅ | `web/src/app/api/campaigns/[id]/briefing/chat/route.ts` |
| Campaign CRUD (list/create/get/patch/delete) | ✅ | `web/src/app/api/campaigns/*` |
| Briefing chat UI (streaming, SSE consumption in client) | ✅ | `web/src/components/campaign/briefing-chat.tsx` |
| Editable briefing summary panel (saves via PATCH) | ✅ | `web/src/components/campaign/briefing-summary.tsx` |
| Campaign list page + new-campaign button + workspace shell | ✅ | `web/src/app/(dashboard)/campaigns/*` |

---

## Phase 3 — Recipient input & enrichment ✅

| Item | Status | Key files |
| --- | :---: | --- |
| Recipient parser (email / `Name <email>` / LinkedIn / bare name) | ✅ | `web/src/lib/parsing/recipients.ts` + 14 tests |
| Minimal CSV parser with header aliases, quoted fields, `;`/`\t` delimiters | ✅ | same file |
| Enrichment provider abstraction | ✅ | `web/src/lib/enrichment/types.ts` |
| Stub enrichment (domain heuristics + LinkedIn slug → name) | ✅ | `web/src/lib/enrichment/stub.ts` |
| Hunter.io adapter (email verify + email finder) | ✅ | `web/src/lib/enrichment/hunter.ts` (activates with env key) |
| Proxycurl adapter (LinkedIn) | ✅ | `web/src/lib/enrichment/proxycurl.ts` (activates with env key) |
| Dispatcher + `EnrichmentCache` with 30-day TTL | ✅ | `web/src/lib/enrichment/index.ts` |
| `POST /api/campaigns/:id/recipients` with dedupe | ✅ | route file |
| `PATCH` / `DELETE /api/campaigns/:id/recipients/:rid` | ✅ | route file |
| Recipient panel: paste / CSV / manual tabs, stats pills | ✅ | `web/src/components/campaign/recipient-panel.tsx` |
| Recipient card: status chip, inline contact edit, expandable draft | ✅ | `web/src/components/campaign/recipient-card.tsx` |
| BullMQ queue façade with inline dev fallback | ✅ | `web/src/lib/queue.ts` |
| Enrichment worker runner (pure) + BullMQ entry point | ✅ | `web/src/workers/enrichment-runner.ts`, `web/src/workers/enrichment.ts` |
| Apollo.io adapter | ⏳ | Planned; Hunter + Proxycurl cover most cases |
| Privacy toggle per campaign | ⏳ | Plumbing is in `enrichRecipient({ privacyMode })`, UI flag pending |

---

## Phase 4 — Draft generation ✅

| Item | Status | Key files |
| --- | :---: | --- |
| Draft writer prompt (structured output) | ✅ | `web/src/lib/llm/prompts.ts` |
| Per-draft quality validators (placeholders, name-in-body, length, fact usage) | ✅ | `web/src/lib/llm/validators.ts` + 5 tests |
| Draft runner (single recipient, retries once) | ✅ | `web/src/workers/draft-runner.ts` |
| Concurrent fan-out with `Promise.all` chunks of 10 | ✅ | `web/src/app/api/campaigns/[id]/generate/route.ts` |
| Regenerate with natural-language instruction | ✅ | `web/src/app/api/recipients/[rid]/regenerate/route.ts` |
| JSON extraction tolerant of preamble prose | ✅ | `extractFirstJsonObject` in `draft-runner.ts` |
| Token usage accounting on `User.monthlyTokenUsage` | ✅ | `draft-runner.ts` |
| BullMQ draft worker | ✅ | `web/src/workers/draft.ts` |
| Draft review UI (inline subject/body edit, regenerate, approve toggle) | ✅ | `web/src/components/campaign/recipient-card.tsx`, `campaign-action-bar.tsx` |
| Per-user monthly budget enforcement (soft + hard cap) | ⏳ | Counter in place; enforcement middleware not yet wired |
| SSE live draft updates (vs. current synchronous fan-out) | ⏳ | Current POST returns all drafts at once; tolerable for ≤50 recipients, upgrade later |

---

## Phase 5 — Push to inbox ✅ (code path complete; 🚧 live verification pending OAuth keys)

| Item | Status | Key files |
| --- | :---: | --- |
| RFC-822 via nodemailer's `MailComposer` | ✅ | `web/src/lib/providers/gmail.ts` |
| `POST /api/campaigns/:id/push` with conservative concurrency (5) | ✅ | route file |
| Confirmation modal (bottom action bar) | ✅ | `web/src/components/campaign/campaign-action-bar.tsx` |
| `Open in Gmail` deep link stored on row | ✅ | Gmail provider response |
| `X-Campaign-Id` header injected for tracking | ✅ | MIME builder |
| Error surfacing on each row + manual retry via regenerate | ✅ | `RecipientCard` |
| Gmail label creation for campaign | ⏳ | planned; requires enabling `gmail.labels` scope |
| SPF/DKIM hygiene warning before send (v2 direct-send) | ⏳ | v2 only |

---

## Phase 6 — Settings & data management ✅

| Item | Status | Key files |
| --- | :---: | --- |
| Default signature + personal links editor | ✅ | `web/src/components/settings/signature-section.tsx` |
| `PATCH /api/account/profile` | ✅ | route file |
| Data export (JSON download) | ✅ | `web/src/app/api/account/export/route.ts` |
| Account deletion (upstream revoke + cascade delete) | ✅ | `web/src/app/api/account/delete/route.ts` |
| Privacy policy page (beta placeholder) | ✅ | `web/src/app/privacy/page.tsx` |
| Terms of service page (beta placeholder) | ✅ | `web/src/app/terms/page.tsx` |
| Public `/data-request` form | ✅ | `web/src/app/data-request/page.tsx` |
| Public `/api/data-request` with cache purge + audit log | ✅ | route file |
| DangerZone UI (export + delete with type-to-confirm) | ✅ | `web/src/components/settings/danger-zone.tsx` |
| Counsel-reviewed policy text | 🚧 | Placeholders in place — swap before commercial launch |
| Cookie consent banner | ⏳ | Not yet needed (no analytics) |

---

## Phase 7 — Beta + Google verification ⏳

- [ ] Run a private beta with ~10–50 test users under the OAuth "test users" cap.
- [ ] Record a demo video of the `gmail.compose` scope being used for Google's app verification.
- [ ] Submit Google OAuth verification; monitor responses.
- [ ] Iterate on feedback; fix top-priority bugs.

## Phase 8 — Public launch ⏳

- [ ] Marketing copy on the landing page (current copy is a first draft).
- [ ] Onboarding email sequence (Resend or SES integration).
- [ ] Status page + uptime check.
- [ ] Product Hunt / X / Hacker News launch post.

## Phase 9 — v1.5 Outlook ⏳

- [ ] Microsoft OAuth provider implementing the `MailProvider` interface.
- [ ] Graph API `createDraft`.
- [ ] Update provider switcher UI (`ProviderAccount.provider === "microsoft"`).
- [ ] Microsoft Publisher Verification.

---

## Known technical debt / open issues

1. **Node 20.8.1** — Prisma 5 / Vitest 2 pinned because Prisma 6 needs 20.19+ and Vitest 4 needs 20.12+. Upgrade Node + bump both at the same time.
2. **LLM usage enforcement** — `User.monthlyTokenUsage` is incremented but no cap-enforcing middleware exists yet.
3. **Rate limiting** — No `@upstash/ratelimit` wrapper yet for auth / campaign create / LLM endpoints.
4. **Progress updates during draft generation** — Current `/generate` route is synchronous and returns all results at once. Fine for ≤50 recipients. Upgrade to SSE before enabling large CSV uploads.
5. **No email verification on signup** — `User.emailVerified` column exists but is never set. Wire up transactional email.
6. **Policy copy** — Privacy/Terms/Data-request pages are placeholders. Replace with counsel-reviewed language before public launch.
7. **`lucide-react` installed but unused** — delete if we don't add icons soon; kept because every shadcn component added later will want it.
8. **`experimental.serverComponentsExternalPackages`** — deprecated-but-still-working Next 14 flag. On the Next 15 upgrade it becomes `serverExternalPackages` at the top level.
9. **Per-user BullMQ isolation** — Current queue design uses shared queues. For multi-tenant prod you'd want per-user prefixed queue names or per-user concurrency caps.
10. **Apollo.io enrichment adapter not yet written** — placeholder position in the provider chain. Hunter+Proxycurl covers most cases; add when a customer needs wider B2B coverage.

---

## How to pick up where you left off

1. Read this file top to bottom.
2. `docker compose up -d` at repo root; `cd web && npm run dev`. For local development, override `AUTH_URL` and `GMAIL_OAUTH_REDIRECT_URI` to your local port before testing OAuth callbacks.
3. Pick the first 🟡 or ⏳ item under the current Phase.
4. When you finish a chunk, flip its status here and add any new files to the *Files* column.
5. If the change reveals a new gotcha, append it to *Known technical debt*.

---

## Useful commands

```bash
# Infra
docker compose up -d        # Postgres + Redis
docker compose down -v      # delete all data too

# Database
npm run db:migrate          # create + apply migration
npm run db:studio           # GUI on :5555
npm run db:reset            # destroy + re-migrate + re-seed

# App
npm run dev                 # Next.js dev server
npm run build               # prod build
npm run typecheck           # tsc
npm run lint                # ESLint (next lint)
npm run test                # Vitest (4 files, 31 tests)
npm run format              # Prettier

# Workers (only when USE_QUEUE_WORKERS=true)
npx tsx src/workers/enrichment.ts
npx tsx src/workers/draft.ts
```

---

## File tree (generated regions, trimmed)

```
Coldbrew AI/
├── PROGRESS.md                    (this file)
├── README.md                      (Google Cloud setup walkthrough)
├── docker-compose.yml
├── docs/spec/                     (original product doc, archived)
├── .github/workflows/ci.yml
└── web/
    ├── prisma/
    │   ├── schema.prisma          (all Section 11 tables + Auth.js)
    │   └── migrations/init/
    └── src/
        ├── middleware.ts          (edge-safe route guard)
        ├── app/
        │   ├── page.tsx           (landing)
        │   ├── privacy/ · terms/ · data-request/   (public)
        │   ├── (auth)/login · signup
        │   ├── (dashboard)/dashboard · campaigns · settings
        │   └── api/
        │       ├── auth/{[...nextauth], signup}
        │       ├── oauth/google/{start, callback, disconnect}
        │       ├── account/{profile, export, delete}
        │       ├── campaigns/{route, [id]/{route, briefing/chat, generate, push,
        │       │                           recipients/{route, [rid]}}}
        │       ├── recipients/[rid]/regenerate
        │       └── data-request
        ├── components/
        │   ├── ui/ (button, input, label, card)
        │   ├── settings/ (connect-gmail, signature, danger-zone)
        │   └── campaign/ (workspace, briefing-chat, briefing-summary,
        │                  recipient-panel, recipient-card,
        │                  campaign-action-bar, new-campaign-button, types)
        ├── lib/
        │   ├── env.ts · db.ts · logger.ts · guards.ts · sse.ts · crypto.ts
        │   ├── auth.ts · auth.config.ts · auth-handlers.ts · oauth-session.ts
        │   ├── queue.ts
        │   ├── providers/ (types, index, google-oauth, gmail, tokens)
        │   ├── llm/ (types, index, anthropic, openai, stub, prompts, schemas,
        │   │        briefing-extract, validators)
        │   ├── enrichment/ (types, index, stub, hunter, proxycurl)
        │   └── parsing/recipients.ts
        └── workers/
            ├── enrichment-runner.ts   (pure fn, no bullmq)
            ├── enrichment.ts          (BullMQ entry point)
            ├── draft-runner.ts        (pure fn)
            └── draft.ts               (BullMQ entry point)
```
