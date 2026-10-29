# Plan: replace apexcharts, and what to look at next

Status: **section 1 and 2 were carried out on `feature/chartjs` (2026-10-29)**; sections 4 and 5 are still the plan.
Look differences settled with the user: the slice slides out (8 px); month labels stay all 12, slanted at 360 px, as Apex
did; the day labels are thinned out (Apex slanted all 31).
**Decided by the user (2026-10-29): Chart.js with our own thin wrapper** (no `ng2-charts`: it saves about 40 of the ~190
wrapper lines, imports `chart.js` statically so the lazy chunk is lost, shallow-merges options on update, and covers none of
the hard parts; `ngx-echarts` is moot). Still open: the look differences in section 1 and the other questions in section 5. Spike code, screenshots and raw numbers
are on the Windows PC only: `/c/cvwt/spike-echarts/`, `/c/cvwt/spike-chartjs/`, `/c/cvwt/audit/AUDIT.md`,
`/c/cvwt/backlog/BACKLOG.md`. Move this file to `feature/<chart-lib>` when the work starts; delete it when done.

How to read the evidence: **measured** = a command ran and I saw the output; **spike** = a sub-agent measured it in a
scratch harness (I viewed its screenshots and re-checked the baseline against the real build); **unverified** = nobody ran it.

## 1. Decision: Chart.js (recommended), ECharts as the fallback

### Size (measured by esbuild, one lazy chunk, `--minify --format=esm --target=es2022`)

Angular's "574 kB raw / 128 kB" is **raw / brotli-11**. I confirmed it on the real build in `desktop/dist`: the apexcharts
chunk is 574,042 B raw, 154,404 B gzip-9, 128,276 B brotli-11. Both spike harnesses reproduce it (573.6 / 574.4 kB raw), so
their other numbers are comparable. Compare the brotli column.

| Chunk | raw kB | gzip-9 kB | brotli-11 kB | vs today (brotli) |
|---|---:|---:|---:|---:|
| apexcharts 4.7.0 (today) | 574 | 155 | 128 | |
| **Chart.js 4.5.1**, doughnut + bar + 2 scales + tooltip, tree-shaken | 162 | 56 | **49** | **-79 kB (-62%)** |
| ECharts 6.1.0, pie + bar + grid + tooltip + markLine + graphic, SVG renderer | 570 | 196 | 166 | +38 kB (+30%) |
| ECharts, same with `title` instead of `graphic` | 559 | 192 | 163 | +35 kB |
| `chart.js/auto`, `import * as echarts` (what not to do) | 204 / 1140 | 70 / 383 | 61 / 312 | |

- ECharts' floor (zrender + core + renderer, no chart type) is already 117 kB brotli; chart types are cheap, the engine is not.
- Trap, Chart.js: `const { Chart, ... } = await import("chart.js")` does not tree-shake (205 kB raw). The lazy chunk must be
  a first-party module with static named imports (3 lines), and the wrapper does `import("./chart-lazy")`.
- Not measured: an `ng build` with either library (Angular's minifier, budgets). Do it in step 7.

### Licence

| | Chart.js | ECharts |
|---|---|---|
| Library | MIT | Apache-2.0 (keep the licence, carry its 3-line `NOTICE` into `NOTICE.md`) |
| Runtime deps | `@kurkle/color` 0.3.4 (MIT) | `zrender` 6.1.0 (BSD-3), `tslib` (0BSD) |
| Compatible with AGPL-3.0 | yes | yes (Apache-2.0 into AGPL-3.0 is allowed) |

Both are fine for a hosted service. The licence audit found nothing else that moved against us: apexcharts is the only
dependency whose licence changed (4.7.0 and 5.0.0 MIT, 5.1.0 "SEE LICENSE IN", current 8.6.0 free only under $2M and an OEM
licence "whatever your size" to embed it). 4.7.0 is the last 4.x release, so it is also a dead end for fixes.

### Behaviour matrix (spike, Playwright on Chromium; WebKit smoke test passed for both)

| # | Behaviour | Chart.js | ECharts |
|---|---|---|---|
| 1 | Tokens (`--chart-1..5`, muted "Other", primary selected bar, muted at alpha .35, destructive over goal, border colour dashed 3 grid, 12/11 px muted labels, money formatter) | pass (pixel-sampled). Font must be passed as the computed family string after `document.fonts.load()`; tabular-nums via CSS on the canvas works in Chromium and WebKit (Firefox unverified) | pass (SVG fills read back). `fontFamily:"inherit"` breaks text measuring: pass the computed family |
| 2 | Donut centre text, changes with hover/focus | pass: inline plugin, no rebuild | pass: `title` updated by partial `setOption` |
| 3 | Hover/click on slice and legend: grow one, dim the rest | **partial**: dim .45 and focus work, grow is `hoverOffset` (8 px slide outwards along the slice), not `scale(1.06)` | **partial**: native `emphasis`/`blur`, grow is `scaleSize` (+6 px on the outer radius only) |
| 4 | Our own HTML tooltip card, no library chrome, no clipping at 360 px, bars share one card across stacked series, tap works | pass (`external` handler, on `<body>`, clamped) | pass (`formatter`, `confine`; never `appendTo: body`: scroll and offset bugs) |
| 5 | Goal line + "Goal" label, red over-goal part, only the top segment rounded | pass (inline plugin; scriptable `borderRadius`) | pass (`markLine`, per-item `borderRadius`); label sits above the line |
| 6 | 12 month / 31 day bars, 55% / 38% width | pass, measured .55 / .38. At 360 px: 6 of 12 month labels, 8 of 31 day labels, no overlap | pass. Same 6 of 12, **and it drops the current month (Oct)**; fixed with a label-interval function |
| 7 | Theme / palette switch recolours, entry animation does not replay | pass, in-place `update('none')` (canvas holds no baked colours, so the rebuild workaround goes away) | pass, in-place or rebuild with `animation:false` |
| 8 | Reduced motion | pass: `animation:false` | pass: entry and hover grow both skip |
| 9 | 360 px, no clipping, no horizontal scroll, resize | pass, needs `layout.padding = hoverOffset` (else 539 edge pixels inked); resize free | pass; ECharts does not watch its box: ResizeObserver + `chart.resize()` |
| 10 | `aria-label` on the chart | canvas `role="img"` + label (1 node for a screen reader). The donut's HTML legend table already carries the data; bars need a visually hidden table (markup built, not read by a screen reader) | host keeps `role="img"`. Do not register `AriaComponent` (it overwrites the label with English text) |
| 11 | Vitest | needs a stand-in like today, or a recording fake 2D context to run the real thing under jsdom (worked in a node script, not tried inside the Angular/Vitest runner) | real library inits in jsdom/happy-dom (`getContext` stub) and in pure Node (`ssr`, `renderToSVGString`); better than Chart.js |
| 12 | Playwright can dump state | canvas: no slices in the DOM. Needs `data-active`/`data-active-index` hooks, pixel sampling, a `fillText` spy | SVG: slice `d` radius (A99 idle, A105 active), `fill-opacity` .45 on dimmed slices; DOM order is not data order |

Port size (non-blank, non-comment lines, builders + emphasis + plugins): Apex 170-182, Chart.js 195, ECharts 192. The
wrapper grows from 79 lines (Apex) to about 190 (Chart.js, incl. the tooltip) or about 95 (ECharts). The SVG-poking code
(`ringCenter`, `keepDonut`, `applySliceEmphasis`, ~55 lines) and the `.apexcharts-*` hooks in `tailwind.css` disappear
either way.

### Recommendation (accepted)

**Chart.js, own wrapper.** It is the only option that gets the Dashboard lighter (-62%, a phone in the shop) and it is MIT with one tiny
dependency. It passes every behaviour in the list; the costs are a canvas (less to assert in the DOM, mitigated by two
`data-*` hooks and the same stand-in strategy we already use) and one visible difference in the hover pop-out.
**Take ECharts instead if** the user wants SVG you can dump and assert, or wants the testing story of a real library in
jsdom more than 80 kB of phone download; its pop-out also differs from today, so it does not buy a closer look.
Neither library has keyboard access to slices; the legend buttons stay the keyboard path, as today.

### Look differences: need the user's OK (DESIGN.md has priority)

1. **Slice emphasis:** today the slice scales 1.06 about the ring centre; Chart.js slides it 8 px outwards (ECharts: 6 px
   on the outer radius). The Chart.js arc can be subclassed to scale instead; the spike did not try it. Ask before choosing.
2. **Month labels at 360 px:** both libraries show about 6 of 12. What Apex shows today is unmeasured: capture it in the
   baseline (step 0). Rule to propose: label every other month and always the selected/current one.
3. **"Goal" label placement and y-axis label width** (`1500,00 zł` eats plot width at 360 px; a compact money format on the
   axis only would help): compare to the baseline, ask if it differs.
4. Everything else (colours, 76% ring, 3 px card-coloured gaps, tooltip card, dashed grid) reproduces. The DESIGN.md text
   changes only in names (`app-apex-chart` becomes the new wrapper).

## 2. Migration steps: one branch `feature/chartjs`

From `main`, one branch, merged into `preview` by the agent; `main` waits for the user's go (root CLAUDE.md). Size: M (about
2 days: wrapper and plugins half a day, builders and specs a day, docs and verification half a day).

0. **Baseline first.** On `main`, with the devstack and mocked fixtures (section 3), capture the "before" screenshots and
   DOM dump of the Dashboard donut and bars in every combination of section 3. They settle look-difference 2 and 3.
1. **Dependency** (`desktop/docs/lockfile.md`): `npm uninstall apexcharts` and `npm i -E chart.js@<newest release at least
   2 weeks old>` with CI's Node 24.22.1 / npm 11.19.1, incrementally (never regenerate the lockfile); `package.json` has
   no apexcharts override to drop. Gate: `npm ci`, `npm audit` 0, `npm run test:ci`, `npm run build`, every `engines.node`
   admits CI's Node. (4.5.1 was spiked; 4.6.1 exists but was 7 days old on 2026-10-29: +1.1 kB brotli.)
2. **Wrapper:** `src/shared-ui/chart/` replaces `src/shared-ui/apex-chart/`.
   - `chart.component.ts` (`app-chart`): same contract as `app-apex-chart` (an `options(colors)` factory, `label`), a
     `<canvas role="img" [attr.aria-label]>`, lazy `import("./chart-lazy")`, theme change = recolour in place with
     `update("none")` (keep the MutationObserver on `class` and `data-palette`; no rebuild, no animation flag),
     `await document.fonts.load()` before the first draw and pass `getComputedStyle(host).fontFamily`, a document
     `pointerdown` handler (touch only) that clears hover and tooltip, destroy on teardown. New inputs/outputs:
     `activeIndex` (the page's `activeSegment` index, wrapper calls `setActiveElements` and `update("emphasis")` and writes
     `data-active` / `data-active-index` on the host) and `(sliceHover)` / `(sliceClick)` to replace the Apex events.
   - `chart-lazy.ts`: static named imports only: `Chart, DoughnutController, BarController, ArcElement, BarElement,
     CategoryScale, LinearScale, Tooltip`. Zoneless: the callbacks write signals, nothing else.
   - `chart-tooltip.ts`: the external HTML handler; move `tooltipCard()` here from the page component (keep the escaping;
     it is on the tokens). `chart-plugins.ts`: module-level plugins (donut centre text, goal line + label, the
     `afterEvent` bridge for mouse-out and touch); plugins cannot be swapped on `update()`, so feed them through
     `options.plugins.<id>` callbacks.
   - `chart-colors.ts` moves unchanged (`readChartColors()`, `toRgb()`); the comment "ApexCharts cannot read CSS variables"
     becomes "canvas cannot".
3. **Option builders** in `overview-page.component.ts` (they stay in the page component; they return Chart.js configs):
   - `donutOptions`: `cutout: "76%"`, `borderWidth: 3` in the card colour, scriptable `backgroundColor` (alpha .45 when
     another slice is active), `hoverOffset` + `layout.padding` equal to it, `animation: false` under
     `prefers-reduced-motion`, centre label/value from `centerText()` through the plugin. Delete `ringCenter`,
     `keepDonut`, `applySliceEmphasis`, the Apex `ChartContext` type and the emphasis `effect` (line ~1464); the wrapper's
     `activeIndex` input replaces it.
   - `barsOptions`: stacked datasets (base, over goal), scriptable colours (primary for `isSelected`, faded muted rgba .35
     otherwise, destructive), `categoryPercentage: 1` with `barPercentage` .55 (over 6 bars) or .38, `borderRadius: 4` on
     the top-most non-empty segment only, `grid.border.dash: [3, 3]`, horizontal grid only, `ticks.callback` money
     formatter, `interaction: { mode: "index", intersect: false }`, x labels with `autoSkip: false` and a callback that
     keeps every other month **and the selected one**, goal plugin when `showGoalLine()`.
   - Keep `barHeading`, translated month names and `translation.t` usage as they are (never translate data).
4. **Stylesheet** (`src/tailwind.css`): delete lines 135-155 (`.apexcharts-tooltip` and the two `.apexcharts-datalabel-*`
   hooks) and `.apexcharts-canvas text` from the tabular-nums rule (replace with the wrapper's canvas class). Tooltip card
   and its hairline use existing tokens; any new class goes in `@layer components` (no unlayered global CSS).
5. **Stand-ins and specs:**
   - Delete `src/testing/apexcharts.stub.ts` and its `vi.mock("apexcharts")` in `setup-vitest.ts`; add a Chart.js
     stand-in (package specifier `vi.mock("chart.js")` and a `function`-style class, per the Spec traps) that records the
     config and `setActiveElements` calls.
   - Rewrite `apex-chart.component.spec.ts` as `chart.component.spec.ts` (lazy load, in-place update on data, theme change
     recolours without a new instance, destroy, `data-active` hook, font family passed).
   - `overview-page.component.spec.ts`: `xaxis.categories` becomes `data.labels`; `series` becomes `datasets[0].data`
     (lines ~436, ~548); the four emphasis/hover tests (~595-660) become wrapper-input tests (`activeIndex`, `data-active`,
     outputs call `hoverSegment` / `toggleFocus`). Add pure tests for the plugins with a fake 2D context (centre text, goal
     line y, label), the tooltip card HTML (escaping), the bar-label rule (selected month always labelled), the rounding
     rule (top-most non-empty segment). `data-testid` on the chart hosts stays (`overview-donut`, `overview-bars`).
   - Optional, if cheap: one spec that runs the real Chart.js under jsdom with a recording fake 2D context (spike: gives
     arc geometry and the `setActiveElements` offsets). Do not block the branch on it.
6. **Docs, same branch** (root CLAUDE.md "Keeping docs current"):
   - `DESIGN.md` line 17 (stack: "ApexCharts through `app-apex-chart`") and line 27 (Charts: new wrapper and path of
     `readChartColors()`, canvas note); `docs/themes.md:59`.
   - `desktop/CLAUDE.md`: delete the apexcharts bullet (lines 98-100) but **keep its last sentence as the general rule**
     ("check a new dependency's `license` field before adding it, and never let `npm update` or `audit fix` cross a licence
     change"); Tests line (47-48) and the Spec traps `vi.mock ... (apexcharts)` example.
   - `desktop/docs/features.md` lines 24-30 (Month chart / Donut), 282 (stack list), 289 (`@defer` note: "apexcharts is a
     dynamic import"), 320 (`skipLibCheck` is "on for apexcharts 4's types": reword, keep the flag).
   - `NOTICE.md`: one line for Chart.js (MIT, © its authors). The README upstream credit and `LICENSE` stay. CHANGELOG
     "Unreleased": replaced the chart library (smaller chunk, licence). `HANDOFF.md`: remove "Parked → Charts", add the
     branch state.
7. **Build gates:** `npm run i18n:check`, `npm run test:ci`, `npm run build`; then `ng build --stats-json` (or the
   build's own table) and record the lazy chunk's raw/brotli size, expected near 160 kB / 50 kB; `grep -ril apexcharts
   dist/` is empty; `npm ls apexcharts` is empty. CI on the branch, then publish `:preview` (`gh workflow run
   publish-image.yml --repo wouekk/cartvibe --ref feature/chartjs`) once CI is green, as CLAUDE.md says.

Rollback: revert the merge; the apexcharts 4.7.0 lockfile entries come back with it (MIT, no drift possible: there is no
4.x above 4.7.0).

## 3. Verification plan

**Unit (Vitest):** as step 5; `npm run test:ci` green, no console errors from the stand-in.

**Build:** step 7, plus `ng build` warnings unchanged, and a check of `ngsw.json` unchanged in shape.

**Playwright against the local dev stack** (not run yet; I confirmed that the launch config, Playwright 1.59.1, Chromium
1217 and the helper `tools/devstack/shot.cjs` exist and that the theme keys are `rw_theme_mode` / `rw_theme_palette`
through `THEME_MODE_STORAGE_KEY` / `THEME_PALETTE_STORAGE_KEY`):

1. Start `redis`, `api`, `web` from `.claude/launch.json` (:6379, :8081, :4200), log in `admin` / `admin`; it lands on
   `/overview/group/<id>`.
2. **Deterministic data first:** `page.route` the group-overview response (`OverviewService.getGroupOverview`) and the
   user preferences (goal) with fixtures: 6 categories + "Other" with a long name, 12 months with two over goal and one
   selected, a 31-day variant, and an empty-category case. Then one real pass on seeded data
   (`api/dev/seed-reporting-data.mjs`, needs an admin API key in `RW_API_KEY`).
3. **Matrix:** viewport 1400 x 900 and 360 x 800 (`hasTouch`, `isMobile`) x Day and Night x Zinc, Indigo, Emerald (Stone and
   Violet only if time) = 12 screenshots of the Dashboard, before (step 0) and after. Open them and compare side by side.
4. **Assertions per combination** (`data-testid` selectors, web-first, no `waitForTimeout`):
   - dump the host DOM and the legend table state (`data-dimmed`, `aria-pressed`, `data-active-index`);
   - sample canvas pixels at the slice and bar centres and compare with `readChartColors()` evaluated in the page
     (series 1-5, "Other", primary / faded / destructive); sample a grid-line pixel for the border colour;
   - spy on `CanvasRenderingContext2D.prototype.fillText` (via `addInitScript`) to assert the centre text, goal label and
     axis labels (money format, translated month names, the selected month always present at 360 px);
   - hover a legend row, a slice (mouse) and tap a slice (touch): `data-active-index` set, other slices dimmed (alpha .45
     sampled), centre text names the category, tooltip card visible and inside the viewport (`boundingBox`), mouse-out /
     tap elsewhere clears; click a slice and a legend dot toggles focus the same way (`aria-pressed`);
   - bars: tooltip on the column shows Spent and Over goal rows; the over-goal part is destructive;
   - theme switch without reload (click the header toggle and palette menu, and set `class` / `data-palette` directly):
     pixels change to the new tokens, canvas instance id unchanged (the wrapper exposes it as a `data-` attribute or the
     test counts `chart-lazy` loads), entry animation not replayed (two screenshots 50 ms apart are equal);
   - `reducedMotion: "reduce"` context: the first frame after load equals the final frame;
   - 360 px: `document.documentElement.scrollWidth <= innerWidth`, no clipping (zero ink on the canvas edge pixels), resize
     the viewport to 320 and back and the chart refits;
   - `page.on("console")` and `pageerror` collect nothing (EvalError would show a CSP or NGXS problem, see section 4).
5. Keep it as `desktop/e2e/dashboard-charts.spec.ts` with mocked routes so the later e2e CI smoke job (section 4) reuses it;
   it is the one e2e spec that needs no seeded data. Credentials from `E2E_*` env variables, as the e2e rules say.
6. Screenshots and the DOM dump go to the PR/branch notes and to the user; the "before/after" pair for each look
   difference of section 1 goes to the user for the OK.

Not coverable locally: Safari and iOS touch, a real phone's devicePixelRatio, Firefox tabular-nums, the NAS reverse proxy.

## 4. Further backlog checks

State checked in the repo, not copied from the notes (HANDOFF is partly stale; see the corrections). Sizes: S under half a
day, M 1-2 days, L several days, XL a project. "Local" = verifiable on the Windows devstack.

| Item | State today (evidence) | Still true / stale | Size | Local |
|---|---|---|---|---|
| **CSP enforcing** (HANDOFF "Open for the user") | `docker/default.conf:171` is `Content-Security-Policy-Report-Only` with `sha256-rhw9yb...`. **I verified:** that is the hash of the CRLF text of the `index.html` theme script (Windows checkout, `core.autocrlf=true`); git holds LF (0 CRs in `HEAD`), whose hash is `sha256-nmUOB4O7+9A5fugnJw+BZySUbOEjQbiuS0vtlnC88yA=`. The published image therefore reports a violation on every page load and enforcing would block the theme bootstrap. Also (sub-agent, failure reproduced, fix unverified): `NgxsModule.forRoot` has no options, NGXS uses `new Function`, an enforced policy blanks the login page. | **Not ready.** Fix: new hash, `.gitattributes` `*.html text eol=lf`, a test asserting the LF hash of `src/index.html` is in `default.conf`, NGXS `compatibility.strictContentSecurityPolicy: true`; then soak report-only on the NAS | S-M | yes (prod build + header), soak on NAS |
| Quick Scan `NextPart: EOF` on a phone | Fixed in `93cf221b` (2026-10-26, v0.11.0+): service-worker bypass interceptor + Content-Length log | mostly stale, only a phone confirmation open | S | phone |
| Accent-palette charts/reports, view-page date save, both panels scrolling, no scroll box on a phone | code present | still unchecked; chart items fold into section 3 | S each | yes (Pixel/iPhone emulation) |
| Safari calendar closing on a pick; barcode (camera, photo fallback) | `DateInputDirective` blurs on pick; zxing scanner | needs real Safari/iPhone; barcode partly local with Chromium's fake-camera flags | S | partly |
| Installable app / service worker / install / wake lock / Share / camera | worker registers, controls after reload and the shell loads offline on a prod build over localhost (sub-agent run); all need HTTPS, so `http://nas:8091` gets none | open until the NAS is behind HTTPS | S + setup | no |
| Login rate limit behind the Synology proxy | nginx-only, keyed `$binary_remote_addr` after `realip` (`set_real_ip_from` private ranges, `real_ip_recursive`, commit `6fa6f6ab`) | the HANDOFF "needs the proxy IP" worry is done; whether DSM sends `X-Forwarded-For` is unverified; test with two clients and a 429 | S | NAS |
| Deploy `:latest`, real Claude/ChatGPT keys, old GHCR `receipt-wrangler` package | package still exists (anonymous tag list answers 200); test connection and model list can run on the devstack, a full scan needs cgo (NAS) | open, user's | S | partly |
| **Backup tab** (CSV export/import) | only a lossy receipts-CSV ZIP exists (`export.go`, `receipt_csv.go`); config import removed in `ba7670ae`; no import anywhere; 49 AutoMigrate tables | still true; phase 1 receipts + products + categories + tags round trip (M + UI S-M), phase 2 lists/rates/templates/groups (M), phase 3 files (M-L); never export keys or tokens; new ids with remap, idempotent import key, "All" never a destination, tx-bounded on SQLite, import as a clean-up-queue task | L total | yes |
| **feature/households** (tenant model) | no tenant model: "Household" is a group name constant (`users.go` `joinHouseholdGroup`); global today: categories, tags, users, roles, `system_settings` (time zone, currency, sign-up, Logo.dev key, MCP), AI keys, exchange rates, API keys, OIDC/OAuth, shop-logos folder, queues | still true; staged: model decision S, schema + migration M-L, enforcement L, settings split L, invites/MCP/queues M-L = XL. Cheap alternative: one container per household. Questions below | XL | yes |
| **e2e in CI** | whole suite run on a scratch devstack: 214 tests, 20 passed (2 are setup), 110 failed, 84 not run, 25 min. 18 real passes (auth 3, legacy-user-visibility 7, system-task-filter 3, 5 singles). Roles-UI dependence: 4 specs (23 tests) plus 15 specs dying in `beforeAll` through UI helpers (`createRole` and friends, about 60 tests; API helpers `apiCreateRole`, `apiSetMemberGrants` exist). Also stale: `/dashboard` vs `/overview`, headings, receipt create flow, report specs | HANDOFF understates it: the suite is mostly broken, not just "several specs". Cheapest value: a smoke job (build image with the shared gha cache, Redis service, seed accounts through the API, Playwright against :80; about 9-11 min a push, estimate) running the 18 green tests plus the new dashboard-charts spec; the config needs a `webServer` switch for `:80`, and the nginx login limit (30/min burst 10) rules out the full suite | smoke M, revive suite L | yes (done once) |
| **Signal Forms** | **HANDOFF is stale.** Installed `@angular/forms` 22.2.3: `form()`, `FormField`, `FormValueControl`, `SignalFormControl`, `compatForm` are `@publicApi 22.0` in the `.d.ts` (I checked); only the WebMCP bits are `@experimental`. The app's `app-input`, `app-select` and friends are not ControlValueAccessors (they take a `FormControl` input): 138 `formGet` uses, 40 files with `FormGroup`/`FormBuilder`, 0 `formControlName`/`ngModel` | stable, but a wholesale migration is L for no user-visible gain. Wait; pilot on the new Backup form if wanted. Trigger: reactive forms deprecated, or a feature only Signal Forms has | pilot S, all L | yes |
| **`--no-install-recommends`** | the Dockerfile's first apt line already has it, the second does not. Published `:latest` (sub-agent, from the ghcr layers): 508 MB compressed, 489 packages / 1337 MB installed, about 225 packages / 471 MB Recommends-only (mesa-vulkan, cpp-14, samba-libs, perl, python3, systemd...). Dropping them would break `tesseract-ocr` (reaches the image only as a Recommends of `tesseract-ocr-eng`; the `ldd` check catches it), `ghostscript` (PDF; the build check catches it), `fonts-urw-base35` and `fonts-liberation` (**not** caught: the test PDF has no text); HEIC is safe | do it, after strengthening the build checks (a text PDF with standard Helvetica through magick and tesseract, a committed tiny HEIC decode, `chromium --headless --dump-dom` and `--print-to-pdf` round trip, `fc-list`, `tesseract --list-langs`). Saving estimate about 350 MB installed, 100-150 MB compressed (not built). Try on a branch with `publish-image.yml --ref` (`:preview` only, never `:latest`) | S-M | no (Docker daemon is off here; CLI 29.9.1 present) |
| **Chromium sandbox** | `html_to_pdf.go:222-240` sets no-sandbox unless `CHROMIUM_SANDBOX=true`; compose files carry no `security_opt` / `cap_*`; `chromium-sandbox` is not in the image | enabling needs user namespaces in the NAS kernel (unverified for DSM) and a seccomp profile allowing `CLONE_NEWUSER` (or `SYS_ADMIN`, rejected); the setuid helper does not fix default Docker; a separate browser container only moves the problem. Threat model (our escaped HTML, JS off, network blocked, uid 10001) says leave it off; cheaper hardening: `no-new-privileges`, `cap_drop: ALL`. If wanted: a runtime probe with fallback (today a wrong `CHROMIUM_SANDBOX=true` breaks every PDF). NAS check: `docker exec -u 10001 cartvibe sh -c 'cat /proc/sys/user/max_user_namespaces; unshare -U true && echo USERNS_OK \|\| echo USERNS_BLOCKED'` | docs S, probe M | NAS |

### Dependencies: licences and freshness (audit, read-only; `npm audit` 0 on the full and production tree)

- **Licences:** no GPL, LGPL, AGPL, SSPL or BUSL in the npm tree or the 93 linked Go modules. Non-permissive items and
  verdicts (a = household fork, b = hosted for others): **Redis 7.4** (both compose files; RSALv2 or SSPLv1, not open
  source; a OK, b WATCH, fine as an internal asynq store but it is the one non-open-source runtime part; options:
  Valkey 8/9 BSD-3 with a fresh volume and a drained `quick_scan` queue, or Redis 8 with the AGPLv3 option, asynq on either
  untested), `go-sql-driver/mysql` MPL-2.0 (linked through the unconditional `gorm.io/driver/mysql` import in `db.go`;
  fine under AGPL), lightningcss MPL-2.0 and caniuse-lite CC-BY-4.0 (dev only, not shipped), `@zxing/text-encoding`
  (Unlicense OR Apache-2.0), `@bufbuild/protobuf` (dev), libheif/libde265 LGPL (dynamic through ImageMagick), Geist OFL-1.1.
- **Attribution gaps (matter for b):** the Angular notice file `3rdpartylicenses.txt` is not shipped (Dockerfile copies only
  `dist/cartvibe/browser`; I confirmed the copy line, `extractLicenses` is `false` in two `angular.json` configs, so
  recheck the production output); not credited anywhere: Open Food Facts (ODbL data, CC BY-SA images; one line with a link),
  the vendored spartan helm sources, Geist's OFL text, Lucide, Chart.js/ECharts (step 6).
- **Licence changes:** apexcharts only; `@zxing/library` metadata moved MIT to Apache-2.0 at 0.22.0 (the LICENSE file already
  was Apache); everything else unchanged.
- **Freshness, direct npm deps:** patch bumps available now: `@angular/{build,cli,cdk}` 22.2.4 to 22.2.5, `postcss`
  8.5.31 to 8.5.32. Can move: `jsdom` 29 to 30 (test only), `@playwright/test` 1.59.1 to 1.64.1 (with the browser build),
  `@spartan-ng/brain` 1.8.1 to 1.9.0 (own change, `spartan-add.cjs` patches), `@zxing/*` 0.1.5/0.21.3 to 0.2.1/0.23.0 (the
  "pinned for Node 20" reason is stale, needs a phone barcode check). Wait: `typescript` 7 (`@angular/build` peer is
  `>=6.0 <6.1`), `@types/node` 26 (stay on 24 with CI's Node). Angular 23 is not out.
- **Go:** `go 1.26.9` has a reachable advisory GO-2026-6809 (crypto/x509, fixed in 1.26.10; via `CreateZipFromTempFiles`):
  raise the directive once `golang:1.26-trixie` carries it (not checked). `golang.org/x/net` v0.61.0 to v0.62.0 (two
  advisories, imported not called), `cdproto`, `genai` small bumps, 38 linked modules in all have updates. The excelize
  pseudo-version has no newer tag. Side images are old (caddy 2.8.4 vs 2.11.7, litestream 0.3.13 vs 0.5.17, restic 0.17.3
  vs 0.19.1; licences unchanged).

Not verified by anyone: the NAS, Synology/iPhone/Safari, DSM `X-Forwarded-For` and user-namespace support, nginx behaviour,
asynq on Valkey or Redis 8, image-size savings (estimates), the NGXS CSP fix, Debian package licences in the image.

## 5. Risks, open questions, order

### Risks (chart migration)

- **Canvas text and fonts:** a canvas does not repaint when Geist loads late; mitigated by awaiting `document.fonts.load()`
  and testing the first paint with a cold cache. The spike used a system font, so the race is **unverified**.
- **Look drift** (section 1): the pop-out and the 360 px label set differ; blocked on the user's OK. Canvas anti-aliasing
  differs slightly from SVG.
- **Plugins are module-level** and cannot be swapped on `update()`: a one-off per-instance plugin would silently not apply.
- **Touch** has no mouse-out: the document `pointerdown` handler is required (spike verified for both libraries).
- **Less DOM to assert:** keep the `data-active*` hooks stable; they are a test contract, document them in `features.md`.
- **Tabular nums on canvas** work through CSS in Chromium and WebKit; Firefox unverified.
- **Static-import trap** for the lazy chunk (section 1); a regression test is a size check on the built chunk (step 7).
- The matrix above is a spike in a harness, not the app: `ng build` size, zoneless `effect()` wiring and the Vitest runner
  are unverified until step 7.

### Open questions for the user

1. Chart.js or ECharts (section 1), and are the look differences OK (slide-out instead of scale pop-out, about 6 of 12 month
   labels at 360 px with the current month always shown, goal label placement)? Or should the arc be subclassed to keep
   the 1.06 scale (a few hours more, untried)?
2. Is "households" about hosting other families (a VPS for others) or only separation inside the NAS install? That decides
   the Redis licence question, attribution work, per-household categories/AI keys/time zone/currency and the Backup format.
   Also: who is a household admin, and can one person belong to several?
3. Can the NAS be put behind HTTPS (Synology reverse proxy and certificate)? It gates the service worker, install, wake
   lock, Share, camera and the CSP soak.
4. Backup: admin-only full dump (ignores per-viewer visibility) or per-user export? Images and shop logos in phase 1? Are
   Litestream and restic on the VPS already enough, making the tab mostly a portability feature?
5. CI: add a roughly 10 minute e2e smoke job to `ci.yml`, and quarantine or delete the four role-editor specs?
6. Slim image: accept `fonts-urw-base35` (15 MB) staying, and a Helvetica-PDF OCR check as the gate?
7. Chromium sandbox: leave opt-in and off (recommended), or build the probe and a seccomp profile?
8. Redis: stay on 7.4 for now, or move to Valkey / Redis 8 with the AGPL option before any hosting?

### Suggested order

1. **CSP fix branch** (hash, `.gitattributes`, LF test, NGXS flag; S-M): a bug today (every page load already reports a
   violation) and independent of the charts.
2. **`feature/chartjs`** (this plan; M), with `e2e/dashboard-charts.spec.ts`. Needs question 1 first.
3. **e2e smoke job** (M), picking up that spec and the 18 green tests.
4. **Licence and security hygiene branch** (S-M): Open Food Facts credit and the missing third-party credits, ship the notice
   file, `go` directive 1.26.10 and `x/net`, the Angular/postcss patch bumps; Redis decision (question 8).
5. **Slim image** (S-M) on `:preview`, after the build checks are strengthened.
6. Local Playwright passes for the "Not yet checked" bullets that need no NAS (mostly covered by the chart matrix); the
   Safari / iPhone / HTTPS items when the user can.
7. **Backup phase 1** (L), with an optional Signal Forms pilot on its form.
8. **Households** only after question 2; it changes Backup's format and e2e fixtures (XL).
9. Chromium sandbox only if the user wants it; Signal Forms wholesale only on its trigger.
