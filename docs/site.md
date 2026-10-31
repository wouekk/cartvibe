# The project site (`site/`)

The marketing page at https://wouekk.github.io/cartvibe/. A static Astro 7 project with Tailwind 4 and the self-hosted
Geist font (`@fontsource-variable/geist`); no cookies, no analytics, no third-party requests. English only.

**Colours.** The site uses the app *icon* palette (near-white `#FFFFFF`/`#F0F3F7`, navy `#202834`, emerald
`#19E68C`→`#119966`, blue `#0D6EFD`→`#0099FF`), not the web app's Zinc tokens, by the owner's choice for this site only.
`DESIGN.md` and the web app are untouched. Tokens live at the top of `src/styles/global.css`; the page follows
`prefers-color-scheme` and the nav toggle (stored in `localStorage`, never a cookie).

## Build and edit

```bash
export PATH="/c/Users/Marcin/tools/node-v24.22.1-win-x64:$PATH"   # Windows PC, see docs/dev-setup.md
cd site
npm ci
npm run dev        # http://localhost:4321/cartvibe/
npm run build      # writes site/dist
```

- All copy is in `src/pages/index.astro` (the `showcases`, `more`, `why`, `rows`, `faq` arrays at the top).
- The shell (head, nav, footer with the licence and the Receipt Wrangler credit) is `src/layouts/Base.astro`.
  Keep `LICENSE`, `NOTICE.md` and the upstream credit in the footer.
- Icons are inline in `src/components/Icon.astro`; screenshots are rendered by `src/components/Shots.astro`.
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

`.github/workflows/pages.yml` builds `site/` on every push that touches it (main and `feature/**`) and deploys
`site/dist` to GitHub Pages from `main` only. The base path is `/cartvibe` (`astro.config.mjs`).
