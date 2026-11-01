# The project site (`site/`)

The marketing page at https://cartvibe.app/. A static Astro 7 project with Tailwind 4 and the self-hosted
Geist font (`@fontsource-variable/geist`); no cookies, no analytics, no third-party scripts. English only. The one request to a
third party is the roadmap's read of the project's public GitHub issues (see "Roadmap and changelog").

**Look.** `DESIGN.md` applies: tokens only (no hex in components), Zinc by default plus the Blue, Indigo, Emerald and Violet
accents, Day and Night. `src/styles/global.css` imports `desktop/src/themes/themes.css` directly, so a palette change in
the app reaches the site; the header has a palette menu and a Day/Night toggle (`localStorage`, no cookie; the page
follows the system on a first visit). The only literal colours are in the logo SVGs under `public/brand/`.

**Scroll showcase.** `index.astro` has a hero, then a tall track (`min-h-[360vh]`, `data-testid="feature-track"`) with a
sticky stage: the script at the bottom of the page turns scroll progress into `data-active` 0-3, which highlights a step
and cross-fades four visual layers (transform and opacity only; with reduced motion, a 150 ms fade). Steps are buttons
and scroll the track. Below `lg` the steps stack with their visuals. The four steps are household features only; the
rest of the app is shown further down with real screenshots.

**Visuals.** The hero and the four steps use real screenshots of the demo (`Shots.astro`, files in `src/assets/shots`, see
"Screenshots"). The old wireframe slots and their art placeholders are gone.

**Wordmark.** `Wordmark.astro` is the one place the name is drawn: "Cart" in the logo text colour, "Vibe" in the brand emerald
(`#16C976`, the colour of the brand SVGs, at night; in the day `#047857`, because the brand green is 2.1:1 on the canvas and fails AA as text) in Zinc and in the active palette's `--primary` in Blue, Indigo, Emerald and
Violet (`.wordmark-vibe` in `global.css`). The app's `--brand-wordmark-accent` token is blue in every palette and the app does
not use it (its own wordmark, `cartvibe-logo.component.ts`, is a fixed emerald), so the site does not read it.

**Footer.** `Footer.astro`, used by `Base.astro`, is the only footer: two quiet lines (the licence and "Upstream credits in
NOTICE", then the no cookies, no analytics, no third-party scripts sentence with the Privacy and Support links). The demo ends
its pages with the same two sentences (`desktop/src/demo/demo-footer.component.ts`), without the two links; keep the wording
in step. The upstream credit (the NOTICE link) stays in the footer, and the FAQ has no separate entry for it;
the full credits with the author names are in `NOTICE.md`.

## Build and edit

```bash
export PATH="/c/Users/Marcin/tools/node-v24.22.1-win-x64:$PATH"   # Windows PC, see docs/dev-setup.md
cd site
npm ci
npm run dev        # http://localhost:4321/
npm run build      # writes site/dist
```

- All copy is in `src/pages/index.astro` (the `steps`, `more`, `grid`, `why`, `rows`, `faq` arrays at the top).
- The shell (head, nav) is `src/layouts/Base.astro`; the footer is `src/components/Footer.astro`. Nav links point at
  `${base}/#section`, so they work from any page. Keep `LICENSE`, `NOTICE.md` and the upstream credit (the NOTICE link
  in the footer, the "free software" line in the Why section).
- Icons are inline in `src/components/Icon.astro`; real screenshots are rendered by `src/components/Shots.astro`.
- Keep the copy honest: no prices, dates, sign-up forms, reviews or counts, and nothing that is not in the app. There is no
  hosted plan (decided 2026-11-02): the page offers self-hosting and CartVibe for iPhone. The `#iphone` section has two cards
  (Self-hosted, and the iPhone app as "Coming soon", a separate app that does not connect to a server, linking to issue #1 until
  there is an App Store page). When the app is live, the button becomes the App Store link, with Apple's badge used as Apple's
  marketing guidelines say.

## Privacy and support

`/privacy/` and `/support/` (`src/pages/privacy.astro`, `support.astro`, on `src/layouts/Doc.astro` and the `.doc` text style in
`global.css`) are the URLs the App Store asks for, linked from the footer. The privacy page covers the site (GitHub Pages, Cloudflare
DNS, local storage, the roadmap's GitHub request), the demo, self-hosting and the iPhone app; the app's section follows the app's
own behaviour (on-device reading, the user's own iCloud, Open Food Facts) and must be checked again when the app ships. Both pages
give `support@cartvibe.app` (an OVH mailbox on the domain). Keep the privacy page true: a new request from the site, a new host
in the app or a change to sync changes it in the same branch. This is not legal advice; nobody reviewed it.

## Screenshots

Real captures of the **demo** (the real app on its made-up household), in `src/assets/shots/<page>-<desktop|phone>-<light|dark>.webp`
(2000 px and 520 px wide, so a 2x screen gets a sharp picture; eight pages: dashboard, charts, shopping, receipts, lines, warranties, reports, check). To redo them:

1. Build and serve the demo: `cd desktop && npm run build:demo && node tools/serve-demo.cjs` (http://localhost:4300/demo/).
2. `cd site && npm run shots` (`tools/shots.mjs`; it borrows Playwright from `../desktop`; set `E2E_CHROMIUM_PATH` for an
   installed Chromium, `DEMO_URL` for another address, `SHOTS_ONLY=lines` or `SHOTS_ONLY=lines-phone-dark` to redo some).

It writes the `.webp` files directly (desktop 1440 px captured at 2x, phone 390 px at 2x). In CI, running the "Project page" workflow by hand with `shots` ticked (job `shots` in `pages.yml`) does all of this on the branch it is started on and commits the files. The demo's "Demo, nothing is saved" strip is
hidden in the captures. The sample data moves with the date (the demo seeds relative to today), so a regenerated set shows other
figures; only the demo's household is ever on screen. Not run in CI.

## Roadmap and changelog

`Roadmap.astro` (the home page section `#roadmap`, four cards per column; `/roadmap/` redirects to it) shows the public issues of
`wouekk/cartvibe` labelled `roadmap` in three columns, with the changelog list (`#changelog`) under the board.

- **Data.** In the browser, `GET https://api.github.com/repos/wouekk/cartvibe/issues?labels=roadmap&state=all&per_page=30`
  (`credentials: omit`, no referrer), cached in `sessionStorage` (`cartvibe-roadmap-v1`) for 15 minutes; every storage access is in
  a try/catch. Pull requests are skipped. Closed with `roadmap` or `status:shipped` is Recently Shipped (not when closed as "not
  planned"); open with `status:in-progress` is In Progress; every other open `roadmap` issue is Planned. Planned and In Progress
  sort by `+1` reactions, Shipped by closing date. Cards show the title, a two-line plain-text summary (Markdown stripped), the
  other labels as chips and a thumbs-up pill that links to the issue. Text is written with `textContent`; links carry
  `rel="noopener noreferrer"`; an issue URL outside the repository is replaced by the board.
- **Fallback.** A network error, a rate limit (403, 60 anonymous requests an hour per address), a bad answer or an empty board shows
  `FALLBACK_ROADMAP` (`src/lib/roadmap.mjs`), silently. It must stay true: planned ideas, one thing under way (the iPhone
  app) and things already in the app. Edit it when the plans change.
- **This is the one third-party request of the site.** The page says so ("The roadmap loads public issues from GitHub when you open
  this page"). The footer sentence ("no cookies and runs no analytics or third-party scripts") stays true: the call is a read of
  public JSON, not a script, and sets nothing. The browser's own console prints a line when GitHub answers 403.
- **Changelog.** `src/lib/changelog.mjs` reads `CHANGELOG.md` at build time (`?raw` import): version, date and up to three
  highlights per release (a Conventional Commit subject, else the bold lead-in, else the first sentence; cut at a clause, 64
  characters at most; Added first, then Changed, Fixed, the rest). The list shows the latest four releases, one line each, and folds the rest into "Older versions". No request
  in the browser. A release without bullet points shows only version and date.
- **For the owner, once:** create the labels `roadmap`, `status:in-progress` and `status:shipped` in the repository (and
  `enhancement` if missing) and label the issues that belong on the board. The agent that built this did not create any. The
  "Request a Feature" button opens a new issue with `enhancement` and `roadmap` already set, so new requests land under Planned
  as soon as they are opened; remove the `roadmap` label from an idea you do not want to show.

## Tests

`cd site && npm test` runs the unit tests (`tests/unit`: the roadmap mapping, cache and fallback, the Markdown stripping, the
changelog parser). `npm run test:e2e` runs the browser tests (`tests/e2e`) against `site/dist` (run `npm run build` first): the
wordmark colour in every palette, day and night, the footer on every page, the privacy and support pages, the roadmap against a mocked GitHub (live, cached, expired cache,
403/500/offline/empty, blocked storage, markup in titles, 360 px overflow), the home page copy and screenshots. They use the
Playwright of `../desktop` (`npm ci` there) and `E2E_CHROMIUM_PATH` for an installed Chromium. No test calls the real GitHub.

## The demo

`https://cartvibe.app/demo/` is the real web app (`desktop/`) built with its `demo` configuration and served
from the same Pages artifact as this page, under `/demo/`. It runs on an in-memory copy of the API with one sample household
and a scripted AI, sends nothing off the page, and keeps its own storage keys. How it works and what to do when the app
changes: `desktop/docs/demo.md`. The site links to it with "Try the demo" in the header (`Base.astro`);
the links are `${BASE_URL}/demo/`, so they follow the base path. The demo ends its pages with the site's two-line footer.

To look at it locally: `cd desktop && npm run build:demo`, then `node tools/serve-demo.cjs` and open
`http://localhost:4300/demo/` (or `npm run start:demo`). `npm run e2e:demo` smoke-tests the built demo.

## Deploy

`.github/workflows/pages.yml` builds `site/` on every push that touches it (or `desktop/src/themes/`) (main and `feature/**`) and deploys
`site/dist` to GitHub Pages from `main` only. The site is served at the root of the custom domain `cartvibe.app`
(`astro.config.mjs`: `site`, `base: "/"`), and the demo under `/demo/` (`desktop/angular.json`, `baseHref`). The domain is set in
the repository's Pages settings (no `CNAME` file with an Actions deploy); the old `wouekk.github.io/cartvibe/` address redirects to
it. DNS lives in Cloudflare (`wouekk/cartvibe-cloud`, `iac/launch/records.tf`): the apex holds GitHub's four A and four AAAA
addresses and `www` is a CNAME to `wouekk.github.io`, all DNS only (not proxied), so GitHub can issue the HTTPS certificate.
The mail records stay with OVH mail.

### Workflow change for the demo (applied by the owner, kept here for reference)

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

### Workflow change for the site tests (applied together with the demo change)

`git apply` this on top of the `pages.yml` patch above (checked against it). It runs the site's unit tests after the site build
and its browser tests after the demo smoke test, which has already installed Playwright's Chromium.

```diff
--- a/.github/workflows/pages.yml
+++ b/.github/workflows/pages.yml
@@ -32,6 +32,9 @@
         working-directory: site
       - run: npm run build
         working-directory: site
+      - name: Site unit tests (roadmap mapping, cache, changelog parser)
+        run: npm test
+        working-directory: site
       # The demo: the real app with an in-memory backend. The production build is made too, because the check below
       # proves the demo is not inside it.
       - run: npm ci
@@ -48,6 +51,10 @@
           npx playwright install --with-deps chromium
           npm run e2e:demo
         working-directory: desktop
+      # The site's browser tests borrow the Playwright and Chromium installed for the demo smoke test above.
+      - name: Site browser tests (wordmark, footer, roadmap against a mocked GitHub, home page)
+        run: npm run test:e2e
+        working-directory: site
       - name: Publish the demo under /demo/
         run: |
           mkdir -p site/dist/demo
```

### Changelog on the site

Each release card shows the sentence under its version heading in `CHANGELOG.md` (the milestone, at most 140 characters). A
release without such a sentence falls back to up to three one-line highlights from its bullets. Keep that sentence short
when writing a release entry.

### Nav highlight

`Base.astro` marks the nav link of the section in view with `aria-current="location"` (links with `data-spy`; the line is 20% down
the screen below the header; nothing is marked above the first section or below the last, and Features follows whichever of its two
elements, the scroll track or the stack, is shown).

## Page background

`Base.astro` renders a fixed `.bg-canvas` (a 48 px hairline grid and a soft primary-tinted spotlight, tokens only, no blur) behind the page. The vignette is a static `::after` overlay fading to `--background` (no mask: a masked fixed layer is re-blended every scroll frame in Safari; the picture is identical within 3/255); a passive, rAF-throttled scroll listener only changes transforms and stops under `prefers-reduced-motion`. Tested in `site/tests/e2e/home.test.mjs`.
