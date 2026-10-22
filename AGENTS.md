# AGENTS.md — What we are building, and who does what

## 1. Product

CartVibe: a fork of Receipt Wrangler (see `NOTICE.md`), extended for one household into **receipts + shopping lists + spending insights**
and branded CartVibe in the UI, the repo, the image and the API.
Used mostly on a phone browser in the shop, and on a desktop for the overview.

**This is a family grocery budget, not expense tracking.** Upstream was built for small businesses:
shared bills, who paid, who owes whom, approval statuses, configurable AI prompts. Here the users are
family members, everyone can add things, and nobody splits bills. Hide what a family does not need,
fill in what it should not have to (paid by = the logged-in user), and keep AI configuration
admin-only with working defaults. The visual target is the **high-craft fintech identity** below (it replaced the old approved mock). The plan is in
`docs/family-budget-rework.md` (Phase 3).

### Shipped (Phase 1 and follow-ups)
- **Shopping lists per group**, several named lists each. Items have a name, an **amount + unit**
  (pcs, kg, g, L, ml, pack, bottle, can, box, bag, jar, bunch, dozen) and a note. Crossing off is
  instant; crossed-off items collect in a collapsible section and come back when re-added by name.
- **Live sync** over Server-Sent Events between everyone viewing a group's lists; a dropped
  connection refetches on reconnect and when the tab regains focus.
- **Overview** landing page: the month's spend and change, open receipts, settle-up, items to buy,
  spend by category, the six-month trend, recent receipts.
- **Labeled dark sidebar** with the everyday pages first and admin pages under "Manage".
- **CartVibe identity and themes:** the supplied logo, icon and loaders; User Settings → Theme offers
  System / Light / Dark and five accents (Classic Blue, Alpine Emerald, Twilight Violet, Walnut Brown,
  Graphite Gray) that tint the page, the sidebar and the buttons. Charts keep fixed colors.
- **Starter reports** (three, created once) and an **AI page every member can use**.

### Phase 2, spending insights, all shipped (`docs/spending-insights-phase-2.md`)
- **2a — receipt products:** the AI reads each receipt's product lines; a backfill reads older
  receipts. *(shipped)*
- **2b — health and seasonality:** healthy / medium / unhealthy per product and per shopping list
  item; fruit and vegetables also seasonal or imported (Western Europe); user corrections are
  remembered. *(shipped)*
- **2c — attach a receipt to a list:** the AI matches products to the list; products not on it are
  **unplanned spend** (every one counts). A receipt without a list counts as planned. When the AI is
  unavailable the photo waits and the read is retried automatically. *(shipped)*
- **2d — monthly spending goals:** optional overall and/or per-category goals. *(moved into Phase 3)*
- **2e — overview tiles:** unplanned spend, unhealthy share (every receipt with food, whatever its
  category), goal progress, a short AI summary. *(moved into Phase 3)*

### Phase 3, family budget rework, shipped (`docs/family-budget-rework.md`)
- Make the app match the approved design and a family's needs: Dashboard landing page with "Add
  receipt" / "New list", paid by and names filled in automatically, bill splitting hidden, simpler
  shopping lists (one-line add, past lists instead of tabs), a simple admin-only AI page (Gemini or
  LM Studio, test connection), hardcoded prompts fed by categories/tags/custom fields, only Admin
  and User roles, household notifications, a Logs tab, a simple currency choice.

### Product rules
- **Web first.** Build UI in `desktop/`, mobile-responsive (thumb-sized targets). There is no mobile app; phones use the web app.
- **SQLite on the NAS.** New models must be SQLite-safe and migrations additive.
- **AI is optional and fallible.** Nothing may block or fail because the AI is missing, slow or out
  of credits: record a status, retry later, degrade to "planned"/"unknown".
- **The AI assigns categories and health, never tags** (tags are the household's own labels), and never a category
  switched off under Manage Categories. Prompts are code, kept short; read `docs/ai-prompts.md` before changing one.

---

## Visual identity: high-craft fintech (binding for every UI change)

This **overrides every older design statement** in these files (the approved `Main.dc.html` mock, the "white cards with a
shadow" settings look, Material/Bootstrap-era patterns). The baseline is a polished, high-craft **fintech** interface built
on **spartan/ui (helm + brain) and Tailwind 4**, on the design tokens of the two themes (White, Black). It has to be
preserved in every screen, dialog, empty state and email-like surface, and a change that looks sloppier than its
neighbours is not done.

**The visual identity always has priority, until the user says otherwise.** When a request (exact values, effects, a new
style direction such as glass or blur) would deviate from it, the agent **pauses and asks** before implementing it; requested
values are adapted to the identity's scales (spacing, radius, motion 150-200ms, tokens) only after the user agrees. A future
platform or business idea mentioned for context is not a request to change the look.

- **Stack, no exceptions:** spartan/ui components from `src/ui`, Tailwind utilities on tokens, Lucide icons, ApexCharts on the
  chart tokens, Geist. No Angular Material, Bootstrap, ad-hoc hex colors, one-off shadows or hand-rolled widgets where a
  helm part exists. New global CSS goes in a Tailwind layer.
- **Craft rules:** one spacing scale (4/8px grid) and one radius family; surfaces are separated by a **subtle surface step
  plus a low-contrast 1px hairline**, not heavy shadows or boxes inside boxes; quiet type hierarchy (small uppercase
  overlines, tabular figures for money, whole part bold and decimals quiet); one control height per row (toolbars align on
  one baseline); restrained, purposeful motion (150-200ms, respects `prefers-reduced-motion`); every state designed
  (hover, focus-visible ring, selected, disabled, loading, empty, error) in **both** themes; dark mode checked for
  contrast (checkboxes, borders, chips must stay legible on hover and selection).
- **Consistency over novelty:** the same thing looks the same everywhere (one period picker, one section/panel pattern for
  settings cards, one tab strip). Fix a pattern once, globally, instead of per page. Tab strips and scroll containers never
  show stray scrollbars.
- **Decided direction (see `docs/ui-issues.md`; settings layout in `desktop/CLAUDE.md`):** settings pages share `app-settings-page` / `-section` / `-tabs` / `-entity-list` (hairline cards, flat rows, Save in the card footer on the right); a single
  period picker with boxed From/To fields; a shared horizontal-scroll utility with no vertical scrollbar; click-to-focus on
  the donut and its legend instead of checkbox chips; real shop logos (static files, white/black outline per theme).
- **Before calling UI work done:** build, run Jest, and look at screenshots at desktop and phone widths in White and Black
  (`HANDOFF.md` describes the local stack).

---

## 2. Infrastructure

- **One monolith image** from `docker/Dockerfile` (nginx :80 → Go :8081). Never add per-component
  Dockerfiles.
- **Built by GitHub, not the NAS:** after CI passes on `main`, `publish-image.yml` pushes
  `ghcr.io/wouekk/cartvibe:latest` and `:sha-<commit>` (amd64 — the NAS is a DS+ model).
  A manual run of the workflow from a feature branch publishes `:preview` only, to try a branch on the
  NAS (point the stack's image at `:preview`) before anything reaches `main`.
- **The NAS** (Synology, Dockhand) runs the root `docker-compose.yml` as a plain stack: the app image,
  plus `redis:7.4-alpine` (background jobs need it; the image has none), SQLite in
  `/volume2/docker/cartvibe/sqlite` (`DB_FILENAME=app.db`), `SECRET_KEY` and
  `ENCRYPTION_KEY` from Dockhand's variables — **no `$` in them** (compose reads it as a variable).
  Deploying = **pull, then redeploy**: a redeploy alone reuses the cached `:latest`, which is how
  the first test ran an image several releases old. Hard-refresh the browser afterwards. Back up the `sqlite` folder before a release that changes the schema.
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
