# Coldbrew AI ☕

> Cold emails, warmly brewed.

An AI-assisted cold email web application. Users describe who they're writing to, drop in recipients, and the app researches each one and drops a personalized draft straight into their own Gmail. They review and send it themselves — drafts only in v1.

See the [full product spec](docs/spec/coldbrew_ai_project_outline.docx) for the complete plan. This README is the developer onboarding guide.

For step-by-step build progress, see [`PROGRESS.md`](./PROGRESS.md).

---

## Repository layout

```
Coldbrew AI/
├── docs/spec/            # The original product/planning document
├── docker-compose.yml    # Local Postgres + Redis
├── PROGRESS.md           # Live progress tracker (read me!)
├── .github/workflows/    # CI pipeline
└── web/                  # Next.js 14 application
    ├── src/
    │   ├── app/          # Routes (App Router)
    │   ├── components/   # React components
    │   └── lib/          # Server utilities (auth, crypto, providers, …)
    └── prisma/           # Prisma schema + migrations
```

## Prerequisites

| Tool   | Version              | Why                                   |
| ------ | -------------------- | ------------------------------------- |
| Node   | **20.8+** (20.18+ preferred) | Runtime                              |
| npm    | 10+                  | Package manager                       |
| Docker | 20+                  | Local Postgres 16 + Redis 7           |

> **Heads up.** Some modern toolchains want Node 20.19+ (Prisma 6, Vitest 4). We pin Prisma 5.22 and Vitest 2 for now so the project runs fine on Node 20.8. Bump Node → Prisma/Vitest together when you're ready.

---

## Quick start

```bash
# 1. Bring up Postgres + Redis
docker compose up -d

# 2. Install app dependencies
cd web
npm ci --legacy-peer-deps

# 3. Create local env (already done on first setup; regenerates secrets)
cp .env.example .env.local
# Then generate:
#   AUTH_SECRET        = openssl rand -base64 48
#   DATA_ENCRYPTION_KEY = openssl rand -hex 32
# and paste into .env.local. A .env file with DATABASE_URL is already present for Prisma.

# 4. Migrate the database
npx prisma migrate dev

# 5. Run the dev server
npm run dev
# → your Vercel production URL after deploy
```

---

## Enabling a real LLM (Gemini — recommended for dev)

The app ships with a deterministic stub so every flow works offline. To get actual AI replies:

1. Go to <https://aistudio.google.com/apikey> and sign in with your Google account.
2. Click **Create API key** → pick *Default Gemini Project* → copy the `AIzaSy…` key.
3. Paste it into `web/.env.local`:
   ```
   GOOGLE_API_KEY="AIzaSy..."
   ```
4. Restart `npm run dev`. The briefing chat and draft writer now call Gemini 2.5 Flash / Pro. No code changes needed — the adapter picks itself based on which env var is set.

Priority order: `GOOGLE_API_KEY` → `ANTHROPIC_API_KEY` → `OPENAI_API_KEY` → stub.

## What works today (Phase 0 + 1)

- Email/password signup with argon2id (`POST /api/auth/signup`)
- Credentials login via Auth.js v5
- Google SSO login scaffolded (needs `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` env to activate)
- Route-guarded `/dashboard` and `/settings`
- Settings → **Connect Gmail** button (needs Gmail OAuth client configured)
- Disconnect flow that revokes the Google grant + wipes local tokens
- Envelope-encrypted token storage (AES-256-GCM, dev KEK derived from `DATA_ENCRYPTION_KEY`)
- Landing / sign-in / sign-up pages styled with Tailwind + shadcn/ui primitives

## What's next

See `PROGRESS.md` for the exact queue, but broadly: briefing chat (Phase 2) → recipient import + enrichment (Phase 3) → draft generation (Phase 4) → push to Gmail (Phase 5).

---

## Google Cloud setup

You'll create **two** OAuth clients in the same Google Cloud project. They serve different purposes:

| Purpose                             | Scopes                                    | Client used in                           |
| ----------------------------------- | ----------------------------------------- | ---------------------------------------- |
| SSO login (optional, nice to have)  | `openid email profile`                    | Auth.js Google provider                  |
| Gmail drafting grant                | `openid email profile gmail.compose`      | Our hand-rolled `/api/oauth/google/*`    |

### Step-by-step

1. Go to <https://console.cloud.google.com/> → create a new project, e.g. `coldbrew-dev`.
2. **APIs & Services → OAuth consent screen**
   - User type: *External*
   - App name: `Coldbrew AI (dev)`
   - Support email: your address
   - Authorized domains: add your real Vercel production domain or custom domain
   - Scopes:
     - `.../auth/userinfo.email`
     - `.../auth/userinfo.profile`
     - `openid`
     - `https://www.googleapis.com/auth/gmail.compose` **← sensitive scope, triggers review later**
   - Test users: add your own Gmail address (so you can actually log in while unverified)
3. **APIs & Services → Library** → enable *Gmail API*.
4. **APIs & Services → Credentials**
   - **Client #1: SSO login**
     - *Create Credentials → OAuth client ID*
     - Application type: Web application
     - Authorized redirect URI: `https://your-vercel-project.vercel.app/api/auth/callback/google`
     - Save the client ID + secret into `.env.local` as `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
   - **Client #2: Gmail drafting**
     - *Create Credentials → OAuth client ID* (a second one)
     - Application type: Web application
     - Authorized redirect URI: `https://your-vercel-project.vercel.app/api/oauth/google/callback`
     - Save into `.env.local` as `GMAIL_OAUTH_CLIENT_ID` / `GMAIL_OAUTH_CLIENT_SECRET`
5. Restart `npm run dev`. The **Connect Gmail** button in Settings now works.

> Until Google approves the app (Phase 7 in the plan), the OAuth screen will warn "unverified" and cap at 100 test users. That's plenty for development and the private beta.

---

## Useful commands

```bash
# Database
docker compose up -d         # start Postgres + Redis
docker compose down          # stop
docker compose down -v       # stop AND delete all data

# Prisma
npm run db:migrate           # create + apply a migration
npm run db:studio            # GUI at http://localhost:5555
npm run db:reset             # DROP EVERYTHING and re-migrate

# App
npm run dev                  # dev server
npm run build                # production build
npm run lint                 # ESLint
npm run typecheck            # tsc --noEmit
npm run test                 # Vitest (unit)
npm run format               # Prettier
```

---

## Security notes for future-you

- **Never** log full access/refresh tokens. Only log their provider IDs.
- The `DATA_ENCRYPTION_KEY` in `.env.local` is dev-only. In prod, replace the `devKek()` in `src/lib/crypto.ts` with an AWS/GCP KMS encrypt/decrypt call; the rest of the envelope scheme stays identical.
- `.env.local` and `.env` are both gitignored. If you ever commit one by accident, rotate every secret inside it immediately.
- The `web/.env` file is only here for the Prisma CLI (which doesn't read `.env.local`). It holds only the database URL — no secrets.

---

## License

TBD.
