# The project site (`site/`)

The marketing page at https://wouekk.github.io/cartvibe/. A static Astro 7 project with Tailwind 4 and the self-hosted
Geist font (`@fontsource-variable/geist`); no cookies, no analytics, no third-party requests. English only.

**Look.** `DESIGN.md` applies: tokens only (no hex in components), Zinc by default plus the Blue, Indigo, Emerald and Violet
accents, Day and Night. `src/styles/global.css` imports `desktop/src/themes/themes.css` directly, so a palette change in
the app reaches the site; the header has a palette menu and a Day/Night toggle (`localStorage`, no cookie; the page
follows the system on a first visit). The only literal colours are in the logo SVGs under `public/brand/`.

**Scroll showcase.** `index.astro` has a hero, then a tall track (`min-h-[360vh]`, `data-testid="feature-track"`) with a
sticky stage: the script at the bottom of the page turns scroll progress into `data-active` 0-3, which highlights a step
and cross-fades four visual layers (transform and opacity only; with reduced motion, a 150 ms fade). Steps are buttons
and scroll the track. Below `lg` the steps stack with their visuals. The four steps are household features only; the
rest of the app is shown further down with real screenshots.

**Art slots.** Each visual is a `Slot` (`data-slot="nanobanana-hero"`, `-step-1` ... `-step-4`): a CSS wireframe of the UI
(`Wireframe.astro`, labelled "Sample data") over `public/art/<slot>.webp`. Those files are 1 px placeholders; replace one
with a real 3:2 image of the same name and the page shows it instead of the wireframe, no code change.

## Build and edit

```bash
export PATH="/c/Users/Marcin/tools/node-v24.22.1-win-x64:$PATH"   # Windows PC, see docs/dev-setup.md
cd site
npm ci
npm run dev        # http://localhost:4321/cartvibe/
npm run build      # writes site/dist
```

- All copy is in `src/pages/index.astro` (the `steps`, `more`, `grid`, `why`, `rows`, `faq` arrays at the top).
- The shell (head, nav, footer with the licence and the Receipt Wrangler credit) is `src/layouts/Base.astro`.
  Keep `LICENSE`, `NOTICE.md` and the upstream credit in the footer.
- Icons are inline in `src/components/Icon.astro`; real screenshots are rendered by `src/components/Shots.astro`.
- Keep the copy honest: no prices, reviews or counts, and nothing that is not in the app. The cloud plan and the
  iPhone app are not released.

## Screenshots

Real captures of the app with made-up data, in `src/assets/shots/<page>-<desktop|phone>-<light|dark>.webp`
(1200 px and 520 px wide). To redo them:

1. Start the devstack (`docs/dev-setup.md`) on a **fresh** database; `admin` / `admin`.
2. `node site/tools/seed.mjs` creates the demo household (receipts with product lines, two shopping lists, warranties,
   a 650 € goal). It reads `API` from `site/tools/lib.mjs` (`http://localhost:8081/api`). Run it once per database.
3. `SHOTS_DIR=<folder> node site/tools/shots.cjs '<json page list>'` (see the file; it uses Microsoft Edge through
   Playwright and the dev server on :4200) writes PNGs for desktop 1440 px and phone 390 px, day and night.
4. `node site/tools/make-images.mjs <folder>` crops and converts them to WebP into `src/assets/shots`.

## Deploy

`.github/workflows/pages.yml` builds `site/` on every push that touches it (or `desktop/src/themes/`) (main and `feature/**`) and deploys
`site/dist` to GitHub Pages from `main` only. The base path is `/cartvibe` (`astro.config.mjs`).

### Changelog on the site

Each release card shows the sentence under its version heading in `CHANGELOG.md` (the milestone, at most 140 characters). A
release without such a sentence falls back to up to three one-line highlights from its bullets. Keep that sentence short
when writing a release entry.
