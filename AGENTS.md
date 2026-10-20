# AGENTS.md — What we are building, and who does what

## 1. Product

Receipt Wrangler, extended for one household into **receipts + shopping lists + spending insights**.
Used mostly on a phone browser in the shop, and on a desktop for the overview.

### Shipped (Phase 1 and follow-ups)
- **Shopping lists per group**, several named lists each. Items have a name, an **amount + unit**
  (pcs, kg, g, L, ml, pack, bottle, can, box, bag, jar, bunch, dozen) and a note. Crossing off is
  instant; crossed-off items collect in a collapsible section and come back when re-added by name.
- **Live sync** over Server-Sent Events between everyone viewing a group's lists; a dropped
  connection refetches on reconnect and when the tab regains focus.
- **Overview** landing page: the month's spend and change, open receipts, settle-up, items to buy,
  spend by category, the six-month trend, recent receipts.
- **Labeled dark sidebar** with the everyday pages first and admin pages under "Manage".

### In progress — Phase 2, spending insights (`docs/spending-insights-phase-2.md`)
- **2a — receipt products:** the AI reads each receipt's product lines; a backfill reads older
  receipts. *(backend + desktop written; merging)*
- **2b — health and seasonality:** healthy / medium / unhealthy per product and per shopping list
  item; fruit and vegetables also seasonal or imported (Western Europe); user corrections are
  remembered.
- **2c — attach a receipt to a list:** the AI matches products to the list; products not on it are
  **unplanned spend** (every one counts). A receipt without a list counts as planned. When the AI is
  unavailable the photo waits and the read is retried automatically.
- **2d — monthly spending goals:** optional overall and/or per-category goals.
- **2e — overview tiles:** unplanned spend, unhealthy share (every receipt with food, whatever its
  category), goal progress, a short AI summary.

### Product rules
- **Web first.** Build UI in `desktop/`, mobile-responsive (thumb-sized targets). No Flutter screens;
  `mobile/api/` is still regenerated with every API change.
- **SQLite on the NAS.** New models must be SQLite-safe and migrations additive.
- **AI is optional and fallible.** Nothing may block or fail because the AI is missing, slow or out
  of credits: record a status, retry later, degrade to "planned"/"unknown".

---

## 2. Infrastructure

- **One monolith image** from `docker/Dockerfile` (nginx :80 → Go :8081). Never add per-component
  Dockerfiles.
- **Built by GitHub, not the NAS:** after CI passes on `main`, `publish-image.yml` pushes
  `ghcr.io/wouekk/receipt-wrangler:latest` and `:sha-<commit>` (amd64 — the NAS is a DS+ model).
- **The NAS** (Synology, Dockhand) runs the root `docker-compose.yml` as a plain stack: the app image,
  plus `redis:7.4-alpine` (background jobs need it; the image has none), SQLite in
  `/volume2/docker/receipt-wrangler/sqlite` (`DB_FILENAME=app.db`), `SECRET_KEY` and
  `ENCRYPTION_KEY` from Dockhand's variables — **no `$` in them** (compose reads it as a variable).
  Deploying = pull + redeploy. Back up the `sqlite` folder before a release that changes the schema.
- **Dockerfile layer order is load-bearing:** dependencies install from the files that declare them
  before the source is copied, so code-only builds reuse the cached PyTorch/Chromium/npm/Go layers.
  Keep per-build values (`VERSION`, `BUILD_DATE`) and source copies below them.

---

## 3. Who does what

### Claude Code — lead engineer
Everything that spans files or components: Go models, repositories, services, handlers,
permissions, background jobs, AI prompts; `api/swagger.yml`; NGXS state and Angular features; CI
and deployment; design docs; fixing what Cline reports.

### Cline (local LLM) — QA and small UI polish
Smaller context, so it stays inside safe boundaries (`.clinerules` is its rulebook):
- **CI triage:** read failing runs with `gh` and write precise diagnostics into `HANDOFF.md`.
- **Local tests** where a toolchain exists (the Windows PC has none).
- **Single-file SCSS/HTML polish** in the fork's own feature folders.
- **Never:** `api/swagger.yml`, generated clients, authentication/OIDC/permissions, migrations or
  models, AI prompts, multi-file changes, speculative fixes for a failing test.

---

## 4. Handoff protocol

Development moves between the **Windows PC** and the **MacBook**, and between **Claude Code** and
**Cline**.
1. At the start of a session, read `HANDOFF.md`.
2. Before ending one, update `HANDOFF.md`: branch and last CI result, what changed, what is next,
   anything failing (exact error and file/line), and questions for the other agent or the user.
3. Cline writes its findings under `## Diagnostics from Cline`; Claude Code clears an entry once it
   is fixed.
