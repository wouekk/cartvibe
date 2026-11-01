# The demo build (`src/demo/`)

Purpose: how the live demo at `https://cartvibe.app/demo/` works, what it fakes, and what to touch when the
app or the API changes. The demo is the real web app, built with its `demo` configuration, running on an in-memory
copy of the API. How it is published is in `../../docs/site.md`.

## What a visitor gets

A signed-in Admin ("Alex Demo") of a three-person household, with about 14 receipts over six months (product lines,
categories, health labels, planned or not), three shopping lists, two warranties, a 650 € monthly goal, three report
templates and a scripted AI. Everything is writable, but only in memory: a slim banner ("Demo, nothing is saved")
carries a Reset button that throws the changes away and reloads the page at its start. Every page ends with the project site's two-line footer (the licence and the NOTICE credit link, and the no
cookies, no analytics, no third-party scripts sentence; `demo-footer.component.ts`, wording kept in step with
`site/src/components/Footer.astro`).

## How it is wired

- `angular.json` → `build:demo` (`npm run build:demo`, `npm run start:demo`): base href `/demo/`, output
  `dist/cartvibe-demo/browser`, **no service worker and no manifest** (so nothing is installable), its own
  `src/demo/index.demo.html` as `index.html`, and one file replacement: `src/demo/demo-runtime.ts` →
  `demo-runtime.demo.ts`.
- **The seam** is `demo-runtime.ts`. In the real app it exports empty things (`DEMO_MODE = false`, no providers, no
  interceptors, an empty `app-demo-banner` and `app-demo-footer`). The demo file exports the in-memory interceptor, the providers and the real
  banner. `app.config.ts`, `app-routing.module.ts` and the layout read only the seam, so the demo code is never
  imported by the real app and is not in its bundle.
- **Backend:** `demoInterceptor` is last in the interceptor chain (after `httpInterceptor`, so errors toast the way they
  do for the real API) and answers every `/api` call from `DemoBackend` (`backend/`). It never calls `next` for
  `/api`. `DemoHttpBackend` replaces `HttpBackend`, so clients built straight on it (Open Food Facts, the translation
  files) are covered too: another origin fails as offline, same-origin files go to the static server. The product
  checker is therefore "offline" in the demo.
- **Sign-in:** `DemoAppInitService` replaces `AppInitService` and loads `GET /user/appData` before the first screen; the
  Login page is never shown unless the visitor logs out (any credentials work). `POST /token` returns the sample claims.
- **Routing** uses the hash (`useHash` from the seam): GitHub Pages cannot rewrite a deep link, so
  `/demo/#/receipts/1/view` is the shareable form.
- **Storage:** `demo-storage.ts` prefixes every `localStorage` and `sessionStorage` key with `cartvibe-demo:` before the
  app starts (the origin, `cartvibe.app`, is shared with the project site). `index.demo.html` reads the prefixed theme keys.
  Reset removes the prefixed keys except the theme and palette.
- **Live stream:** the shopping lists' `EventSource` is replaced by a stand-in that never opens
  (`demo-event-source.ts`); each change is applied from the answer to the call, as with the real stream.

## The backend (`backend/`)

- `seed.ts` builds the household from `today` (UTC calendar day): this month's receipts are spread over the days so far,
  earlier ones sit on fixed days of the five months before, so the Dashboard is never empty. Same day in, same data out.
- `routes/*.ts` register paths on a small `DemoRouter` (`router.ts`; a literal segment is registered before a `:param`
  that would match it). Shapes are typed with the generated `open-api` models, so a contract change breaks the build.
  The overview, paging, filters, the receipt search and the report engine follow the Go code
  (`group_overview.go`, `receipts.go`, `reporting/`); **money is whole cents** (`money.ts`), parsed from and written as
  decimal strings, never floats; lists are never `null`.
- **Scripted AI** (`scripted-scan.ts`): Quick Scan, shopping-trip photos, Magic Fill and "Read again" never look at the
  picture; they find "Sunday brunch" at "Corner Bakery" (16.90, five lines). "Read again" scales those lines to the
  receipt's total. Pictures are drawn from the receipt's own data (`receipt-image.ts`; the paper stays white in both
  themes). An item typed on a list is classified by a small word list (`routes/shopping.ts`).
- **Downloads** are real files built in `files.ts`: a zip of CSVs (export), CSV, XLSX and a one-page PDF (reports).
- A call nothing answers gets a 404 and `console.warn("[demo] no answer for …")`. Provider keys are dropped, never stored.

## When the app changes

- A new endpoint the UI calls needs a route and a spec case. Open the page in `npm run start:demo` and watch the console
  for `[demo] no answer`.
- A new UI string goes through `| t` as everywhere (five languages). Texts the demo backend sends as `errorMsg` are
  English and listed in `scripts/i18n/extra-keys.json`.
- The demo adds nothing the production build may contain: `npm run check:demo` (after `ng build` and `ng build
  --configuration demo`) fails if one of the markers in `tools/check-demo-bundle.cjs` is in the production JavaScript,
  and also if one is missing from the demo (so the check cannot pass vacuously). Add a marker when you add a new kind
  of demo-only text.

## Checks

`npm test` (specs in `src/demo/`: money, seed invariants, the backend, the interceptor, storage, banner, session),
`npm run build:demo`, `npm run check:demo`, and `npm run e2e:demo` (Playwright against the built demo served by
`tools/serve-demo.cjs`, config `playwright.demo.config.ts`, specs in `e2e-demo/`; set `E2E_CHROMIUM_PATH` to use an
installed browser, as in `sandbox.md`). The e2e run needs no API and no accounts.

## Known gaps (found in review, left on purpose)

The demo is a stand-in, not the API. Differences that do not change the seeded figures: the receipt filter ignores
receipt-level categories and tags on older data, "this month" includes days after today, a name filter always means
"contains", there is no 100-row cap on a report drill-in; the report engine labels ("Total", "Unknown") are English, AVG
averages lines rather than receipts, and lines adding up to more than a receipt are not scaled down; the PDF holds one
page of plain text; `ReceiptProduct`-level category grants are not modelled; about twenty error messages for stale ids are
English only; Reset asks nothing. Roles can only be read (the UI offers none to edit) and the sign-in-provider flows answer
"switched off".
