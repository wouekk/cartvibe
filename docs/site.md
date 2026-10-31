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
- Keep the copy honest: no prices, dates, sign-up forms, reviews or counts, and nothing that is not in the app. The Cloud plan
  section (`#cloud`) says a hosted option is planned and nothing more; no phone app is mentioned.

## Screenshots

Real captures of the app with made-up data, in `src/assets/shots/<page>-<desktop|phone>-<light|dark>.webp`
(1200 px and 520 px wide). To redo them:

1. Start the devstack (`docs/dev-setup.md`) on a **fresh** database; `admin` / `admin`.
2. `node site/tools/seed.mjs` creates the demo household (receipts with product lines, two shopping lists, warranties,
   a 650 € goal). It reads `API` from `site/tools/lib.mjs` (`http://localhost:8081/api`). Run it once per database.
3. `SHOTS_DIR=<folder> node site/tools/shots.cjs '<json page list>'` (see the file; it uses Microsoft Edge through
   Playwright and the dev server on :4200) writes PNGs for desktop 1440 px and phone 390 px, day and night.
4. `node site/tools/make-images.mjs <folder>` crops and converts them to WebP into `src/assets/shots`.

## The demo

`https://wouekk.github.io/cartvibe/demo/` is the real web app (`desktop/`) built with its `demo` configuration and served
from the same Pages artifact as this page, under `/demo/`. It runs on an in-memory copy of the API with one sample household
and a scripted AI, sends nothing off the page, and keeps its own storage keys. How it works and what to do when the app
changes: `desktop/docs/demo.md`. The site links to it with "Try the demo" in the nav (`Base.astro`), the footer and the hero
(`index.astro`); the links are `${BASE_URL}/demo/`, so they follow the base path.

To look at it locally: `cd desktop && npm run build:demo`, then `node tools/serve-demo.cjs` and open
`http://localhost:4300/cartvibe/demo/` (or `npm run start:demo`). `npm run e2e:demo` smoke-tests the built demo.

## Deploy

`.github/workflows/pages.yml` builds `site/` on every push that touches it (or `desktop/src/themes/`) (main and `feature/**`) and deploys
`site/dist` to GitHub Pages from `main` only. The base path is `/cartvibe` (`astro.config.mjs`).

### Pending workflow change for the demo (the owner applies it)

Agents may not edit `.github/workflows/`, so the demo is **not published or checked in CI until these two patches are
applied** (`git apply`; both were checked against the workflows at the time of writing). The first makes the Pages build
also build the demo, check that it is not in the production bundle, smoke-test it, and copy it to `site/dist/demo/` (the
deploy still happens from `main` only; the trigger now includes `desktop/**` so a change to the app republishes the demo).
The second adds the demo build and the bundle check to the `test-desktop` job of `ci.yml`.

```diff
--- a/.github/workflows/pages.yml
+++ b/.github/workflows/pages.yml
@@ -1,11 +1,12 @@
 ---
 name: Project page
 
-# site/ is an Astro project. Every push that touches it builds it; only main deploys.
+# site/ is an Astro project, and desktop/ is built a second time in its `demo` configuration (desktop/docs/demo.md) and
+# published under /demo/ of the same artifact. Every push that touches either builds both; only main deploys.
 on:
   push:
     branches: [main, 'feature/**']
-    paths: ["site/**", "desktop/src/themes/**", ".github/workflows/pages.yml"]
+    paths: ["site/**", "desktop/**", ".github/workflows/pages.yml"]
   workflow_dispatch:
 
 permissions:
@@ -24,11 +25,33 @@
         with:
           node-version: "24.22.1"
           cache: npm
-          cache-dependency-path: site/package-lock.json
+          cache-dependency-path: |
+            site/package-lock.json
+            desktop/package-lock.json
       - run: npm ci
         working-directory: site
       - run: npm run build
         working-directory: site
+      # The demo: the real app with an in-memory backend. The production build is made too, because the check below
+      # proves the demo is not inside it.
+      - run: npm ci
+        working-directory: desktop
+      - run: npm run build:demo
+        working-directory: desktop
+      - run: npm run build
+        working-directory: desktop
+      - name: The demo is compiled out of the production build
+        run: npm run check:demo
+        working-directory: desktop
+      - name: Smoke-test the built demo
+        run: |
+          npx playwright install --with-deps chromium
+          npm run e2e:demo
+        working-directory: desktop
+      - name: Publish the demo under /demo/
+        run: |
+          mkdir -p site/dist/demo
+          cp -r desktop/dist/cartvibe-demo/browser/. site/dist/demo/
       - uses: actions/configure-pages@v6
         if: github.ref == 'refs/heads/main'
       - uses: actions/upload-pages-artifact@v5
```

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -115,6 +115,13 @@
       - name: Check CSP script hash
         run: npm run check:csp
         working-directory: ./desktop
+      # The demo (desktop/docs/demo.md) builds from the same sources; none of it may reach the production bundle above.
+      - name: Build the demo
+        run: npm run build:demo
+        working-directory: ./desktop
+      - name: Check the demo is compiled out of the production build
+        run: npm run check:demo
+        working-directory: ./desktop
       - name: Generate coverage report
         uses: irongut/CodeCoverageSummary@v1.3.0
         with:
```
