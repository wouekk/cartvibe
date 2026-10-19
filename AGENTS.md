# AGENTS.md — Custom Fork Architecture & Agent Roles

## 1. Fork Vision: Shopping List & Grocery Tracker (OurGroceries Style)
We are extending Receipt Wrangler into a combined **Receipt Manager + Group Shopping List Tracker**.

### Functional Requirements
- **Group-Scoped Lists (`Option B - Standalone`):**
  - Shopping lists belong to a `Group` (just like Receipts and Categories).
  - A group can have multiple named lists (e.g., "Supermarket", "Hardware Store", "Pharmacy").
  - Items are checked off manually while shopping (`isChecked` boolean + `checkedAt` timestamp). Checked items move to a collapsible "Crossed Off" bottom section for easy re-adding later.
  - Optional manual link: A completed shopping trip can optionally link to a `Receipt` ID for record-keeping, but does NOT rely on automated OCR line-item matching.
- **Web-First Target (`desktop/` + `api/`):**
  - Build UI features in the **Angular 19 web app (`desktop/`)** with a mobile-responsive layout (big touch targets for checking off items in-store on a phone browser).
  - Do NOT build Flutter UI screens in `mobile/`. **HOWEVER**, whenever `api/swagger.yml` changes, you MUST still regenerate `mobile/api/` alongside `desktop/src/open-api/` so CI and repo guardrails never break.
- **Lightweight Real-Time Sync (SSE):**
  - Implement a lightweight Server-Sent Events (SSE) endpoint in the Go Chi backend (`/api/shopping-list/group/{groupId}/stream`) to broadcast list/item mutations (`ITEM_ADDED`, `ITEM_TOGGLED`, `ITEM_DELETED`) to connected browsers in the same group.
  - Keep it simple and resilient: if SSE disconnects on mobile cell networks, fall back gracefully to standard HTTP fetch on tab focus.

---

## 2. Infrastructure & Synology NAS Deployment (Dockhand)
- **Monolith Docker Build:** Production deploys via `docker/Dockerfile` (single container with nginx on port 80 proxying `/api` to Go on port 8081).
- **Database:** Uses the built-in **SQLite** engine stored in `/app/receipt-wrangler-api/sqlite`.
  - All new GORM models/migrations (`ShoppingList`, `ShoppingListItem`) MUST be 100% compatible with SQLite (`shopspring/decimal` for any numbers, no Postgres-only column types).
- **Pre-built image, no build on the NAS:** after CI passes on `main`, `.github/workflows/publish-image.yml` builds `./docker/Dockerfile` (context `.`, amd64) on GitHub and pushes `ghcr.io/wouekk/receipt-wrangler:latest` (plus a `sha-<commit>` tag). The NAS runs `docker-compose.yml` as a plain Dockhand stack with `image:`, not `build:`; deploying = pull + redeploy. Never add per-component Dockerfiles.
- **Dockerfile layer order is load-bearing:** dependencies are installed from the files that declare them before the source is copied, so code-only builds reuse the cached PyTorch/Chromium/npm/Go layers. Keep per-build values (`VERSION`, `BUILD_DATE`) and source copies below them.

---

## 3. Division of Labor: Claude Code vs. Cline (Local LLM)

### Claude Code = Lead Architect & Powerhorse
Claude Code handles all complex, multi-file, and cross-component engineering:
- Designing Go backend models, GORM repositories, services, Chi handlers, permissions (`group.shopping-lists.*`), and SSE streaming in `api/`.
- Editing `api/swagger.yml` and running OpenAPI client regeneration (`./generate-client.sh`).
- Wiring NGXS state stores (`desktop/src/store/`) and complex Angular components.
- Resolving bug reports, test failures, and diagnostics logged by Cline in `HANDOFF.md`.

### Cline (Local LLM) = Junior Assistant, UI Tweaker & QA Scout
Cline runs on a local LLM with a smaller context window and must stay strictly within safe boundaries:
- **Read-Only QA & Testing:** Run `go test ./...` or `npm test`, inspect logs, reproduce issues, and write structured diagnostic reports into `HANDOFF.md` for Claude Code to fix.
- **Isolated UI/CSS Polish:** Small, single-file HTML/SCSS tweaks in `desktop/src/app/` (e.g., adjusting spacing, button styles, or mobile responsiveness).
- **Strict Prohibitions for Cline:**
  - NEVER modify `api/swagger.yml` or run client generators.
  - NEVER edit files in `desktop/src/open-api/` or `mobile/api/`.
  - NEVER touch authentication, OIDC, GORM migrations, or multi-component state.
  - If a test fails during QA, DO NOT attempt speculative fixes—document the exact error output and file/line in `HANDOFF.md` and hand it off to Claude Code.

---

## 4. Cross-Device & Cross-Agent Handoff Protocol
Because development switches between **Windows PC** and **MacBook** and between **Claude Code** and **Cline**:
1. At the start of any session, read `HANDOFF.md`.
2. Before ending a session or switching devices/agents, update `HANDOFF.md` with:
   - Current active branch and last tested state.
   - Completed items vs. pending next steps.
   - Any failing tests, stack traces, or questions for the other agent.