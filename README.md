# Trove

**Save anything. Find everything. Never lose a link again.**

Trove catches every link you save — from Telegram, the web, wherever — auto-sorts it into a category with Claude, and puts it all in one searchable dashboard so nothing you save is ever lost again.

- **`backend/`** — NestJS + Knex + Postgres API (auth, ingestion, categorization, Telegram bot)
- **`frontend/`** — Next.js 14 dashboard wired to the API

---

## Why I built this

I save a lot and revisit almost none of it. Instagram reels I meant to come back to, job posts I'd apply to "tomorrow", AI tools someone recommended, product pages, PDFs a creator sent me. Every one of them lands somewhere different — a browser tab, a chat thread, a screenshot — and then it's gone.

The failure isn't saving. Saving is easy and I do it constantly. The failure is **retrieval**: nothing I save is ever organised, so finding it again costs more effort than just re-searching from scratch. So I never go back, and the saving was pointless.

Trove is the fix I wanted for myself: one place everything lands, sorted automatically, searchable in one box.

## The problem it solves

| The problem | What Trove does |
|---|---|
| Saved links scatter across tabs, DMs, and screenshots | One inbox — every capture surface hits the same ingestion endpoint |
| Nothing is organised, so nothing is findable | Claude classifies each item into a category with a one-line summary and tags |
| Saving the same thing twice makes the mess worse | Deduped on `(user_id, url_hash)` — a re-save bumps the date instead of duplicating |
| Files sent by other people vanish into chat history | Forward a PDF/doc to the Telegram bot; it's stored, hashed, typed, and sorted |
| You can't tell if saving is even working | Rediscovery rate (opens ÷ saves) is tracked as the north-star metric |

## What it does

- **Capture from anywhere** — the web "Add link" box, or a Telegram bot you forward to from your phone.
- **Auto-categorise** — Claude reads the page metadata and files it under one of your category slugs, with a summary and tags. No API key? A keyword fallback keeps it working.
- **Store files, not just links** — PDFs, docs and images are saved to disk, deduped by content hash, and tagged by type.
- **Search and browse** — one dashboard, filter by category, full-text search across titles and summaries.
- **Dedupe automatically** — one row per link, per user.
- **Track rediscovery** — every open increments `open_count`.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | NestJS 10 (TypeScript), layered Controller → Service → Query |
| Database | Postgres 16, Knex query builder + migrations, `data` schema |
| Validation | Zod DTOs via a custom validation pipe |
| Auth | JWT (`@nestjs/jwt`) + bcrypt, optional Google OAuth (`google-auth-library`) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) for categorisation, strict JSON contract |
| Capture | Telegraf (Telegram bot, long polling) |
| Files | Multer upload → local disk `StorageService` (S3-swappable) |
| Frontend | Next.js 14 (App Router), React 18, lucide-react |
| Local infra | Docker Compose (Postgres) |

Backend conventions: Controller → Service → Query over Knex, Zod DTOs, a standardised response envelope, enum-driven endpoints and messages, and migrations in the `data` schema.

## Status

**Working end-to-end locally.** Not yet deployed.

Done:
- Email/password + Google sign-in, JWT-guarded API
- Link ingestion with dedupe, async enrichment, Claude categorisation (+ keyword fallback)
- File upload and Telegram file capture with content-hash dedupe
- Telegram account linking via deep link
- Dashboard: category filter, search, open-tracking

Known limits:
- Enrichment runs inline (`setImmediate`), not on a real queue
- Telegram bot uses long polling, not a webhook
- Metadata extraction is lightweight OG-tag parsing — JS-heavy sites (Instagram) often return a login wall
- No automated test suite yet

## Roadmap

**Next**
- Deploy backend + frontend, switch the Telegram bot to a webhook
- Move enrichment to a BullMQ queue (the `EnrichmentService.enqueue()` seam is already there)
- Automated tests around ingestion, dedupe and categorisation

**After that**
- Mobile share-sheet target so saving is one tap from any app
- Browser extension as a third capture surface
- Better metadata for hard sites (hosted metadata API or headless fetch)
- S3 storage driver behind the existing `StorageService` interface
- Rediscovery nudges — resurface things you saved and never opened

---

## Prerequisites

- Node.js 20+ (built and tested on Node 22)
- A Postgres 14+ database (use the included `docker-compose.yml`, or your own / Neon)

Optional but recommended for the full experience:
- An **Anthropic API key** (categorization). *Without it, a keyword fallback runs so the app still works end to end.*
- A **Telegram bot token** (from @BotFather) for phone capture
- A **Google OAuth web client ID** for "Sign in with Google"

---

## Setup

Three terminals' worth of work, about five minutes. Backend and frontend are independent — start Postgres first, then each app.

## 0. Clone

```bash
git clone <your-repo-url> trove
cd trove
```

## 1. Start Postgres

```bash
docker compose up -d        # starts Postgres on localhost:5432 (db/user/pass: trove)
```

Or point at any Postgres by editing `backend/.env`.

## 2. Backend

```bash
cd backend
cp .env.example .env         # fill in secrets (JWT_SECRET at minimum)
npm install
npm run db:migrate           # creates the data schema + 4 tables
npm run start:dev            # http://localhost:4000/api
```

Key `.env` values:

| Variable | Needed for | If empty |
|---|---|---|
| `JWT_SECRET` | auth | **set this** (any long random string) |
| `DB_*` | database | defaults match docker-compose |
| `ANTHROPIC_API_KEY` | smart categorization | keyword fallback used |
| `TELEGRAM_BOT_TOKEN` | Telegram capture | bot disabled, web capture still works |
| `GOOGLE_CLIENT_ID` | Google sign-in | email/password still works |

## 3. Frontend

```bash
cd frontend
cp .env.local.example .env.local     # NEXT_PUBLIC_API_URL=http://localhost:4000/api
npm install
npm run dev                          # http://localhost:3000
```

Open http://localhost:3000, create an account, and start saving links.

---

## How it works

**One ingestion path.** Every capture surface — the web "Add link" box, the Telegram bot, and later a mobile share sheet or browser extension — calls the same `ItemService.ingest()`. That's the core design decision: capture is decoupled from storage, so new surfaces are additive and never touch the dashboard or the DB logic.

**Files, not just links.** Trove also stores files — a PDF or document a creator sends you. Forward it to the Telegram bot (or use the upload button in the dashboard) and it's stored on disk, deduped by content hash, tagged by type (`pdf`, `docx`…), and sorted by filename into a category. Files are stored under `STORAGE_DIR` (local disk in dev; the `StorageService` interface swaps to S3 without touching anything else).

> **Note on DM capture:** auto-reading your personal Instagram/WhatsApp DMs is not possible — those platforms don't expose personal message APIs, and automating them gets accounts banned. The sanctioned path is one tap: use the app's **Share** button on a link/file and send it to Trove (Telegram bot today; a mobile share target is the natural next surface). Both reuse the same ingestion endpoints.

**Save → sort → shelve.**
1. A link hits `POST /api/items` (or arrives via the bot) → saved immediately as `processing`, deduped on `(user_id, url_hash)`.
2. Enrichment (async) fetches page metadata and asks Claude to classify it into one of your category slugs, returning a one-line summary and tags.
3. The item flips to `ready` and lands in its category on the dashboard.

**Dedupe.** Saving the same link twice keeps one row and bumps its date — it floats back to the top instead of duplicating.

**Rediscovery metric.** Opening a link from the dashboard increments `open_count`. Rediscovery rate (opens ÷ saves) is the north-star.

## Production notes

- Enrichment runs inline (`setImmediate`) for simplicity. For scale, swap it for a **BullMQ** queue backed by Redis — the `EnrichmentService.enqueue()` seam is already where that goes.
- Metadata extraction uses lightweight OG-tag parsing. For hard sites (Instagram, JS-heavy pages), swap in a hosted metadata API or headless fetch behind the same method.
- The Telegram bot uses long polling (great for local dev). For production, switch to a webhook.
- Categorization uses `claude-sonnet-4-6` with a strict JSON contract and a keyword fallback.

## API surface

```
POST /api/auth/register           { email, password, displayName? }
POST /api/auth/login              { email, password }
POST /api/auth/google             { idToken }
GET  /api/auth/me

GET  /api/categories
POST /api/categories              { name, color? }

GET  /api/items?category=&search=
POST /api/items                   { url, caption?, captureSource? }
GET  /api/items/:uuid
PATCH/api/items/:uuid             { categoryUuid?, title? }
DELETE /api/items/:uuid
POST /api/items/:uuid/open

POST /api/files                   multipart: file (PDF/doc/image) + caption?
GET  /api/files/:uuid             streams the stored file (Bearer auth)

POST /api/telegram/connect        -> { deepLink }
GET  /api/telegram/status         -> { connected, username }
```

All item/category/telegram routes require `Authorization: Bearer <token>`.
