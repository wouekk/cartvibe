# HANDOFF.md — where things stand

Session state only, read by every session: keep it under about 3 KB. Delete an entry once it is done (git history and
`CHANGELOG.md` keep it); permanent knowledge goes into a guide, `DESIGN.md` or `docs/dev-setup.md`.

## Current state

- **v0.19.0 was released on 2026-11-12** (the owner's go). `main` and `preview` are the same commit. The release
  holds the whole audit of 2026-11-09 (`docs/AUDIT-REPORT.md`, every sprint ticked) and what the owner's NAS try
  turned up; `CHANGELOG.md` has it all, with the update notes. New work is a `feature/<name>` branch from `main`,
  merged into `preview` and published as `:preview`; `main` waits for the owner's go again.
- **In `preview`, not on `main`** (waiting for the owner's go): `feature/dashboard-sentence` (`714f2e93`, green
  CI, in `:preview`, 2026-11-12): the Dashboard's sentence leads in bold, colours how far the month is from the
  goal (red over, green under or on it) and no longer says the days left (DASH-12). The agent kept "so X a day
  stays on goal" under the goal, which the owner did not ask to remove: say so if it should go too.
- **Left out of the release on purpose:** a GitHub Release page for v0.19.0 (0.18.0 has none either; the tag and
  the images are the release), and the upgrade fixture `api/internal/repositories/testdata/schema-v0.19.0.sql`
  (add it with the next API change; the header of `release_upgrade_test.go` says how).
- **Open: Quick Scan from the camera on Android** (the owner's report of 2026-11-12: *Take a photo* over plain
  http "does not work" and leaves no trace). Not reproduced: the real app scans fine in Chromium as a Pixel 7 on
  a plain-http address, so http is not the cause; the likely one is Android closing the page while the camera
  app is open. 0.19.0 makes it visible (SCAN-16): a message at the next start with the workaround, and an "app
  report" line in the server log. **Ask the owner** what the phone shows now and what that line says. If the
  page is being closed, the real fix is a camera inside the page, which needs HTTPS.
- **Decisions the audit report marks as made differently, waiting for the owner's word:** icons stay on one
  map, the six small Dashboard tiles stay as markup, three contract inaccuracies are recorded and not corrected,
  `receipts.amount` is kept in step by triggers.
- The owner stays on Logo.dev with downloaded logos (2026-11-12: Brandfetch and a logo CDN were turned down).
- Dependabot's nine pull requests of 2026-11-10 close now that the work is on `main` (#21 and #22 at its next run).
- The project is on Node 26.13 (in `tools\node-v26.13.0-win-x64` on the PC; **the Mac needs Node 26 before work
  there**).
- The main checkout is on `feature/releases-and-ci`, another session's: leave it alone. `i18n-audit-en-pl.md` and
  `docs/plans/` there (untracked) are the owner's. The working worktree is `.claude/worktrees/dependency-updates`;
  `.claude/worktrees/preview-merge` holds `preview`.
- On the PC the picture tests are skipped (no `magick`, `tesseract`, `gs`) and the race detector cannot run, so
  only CI proves them. The real server runs there in production mode with the built app (`api.exe --env prod`
  with `WEB_ROOT`, `LISTEN_ADDRESS`, `DB_ENGINE=sqlite`, `SECRET_KEY`, `ENCRYPTION_KEY`, `BASE_PATH`); a
  plain-http, non-localhost address for a phone-sized Chromium is `--host-resolver-rules=MAP cartvibe.test
  127.0.0.1`. Stopping the background task leaves `api.exe` running: end the process too.
- Playwright: on the Mac `failed-activity-source-file` and `system-task-filter` fail (15 skipped behind them);
  never run: `app-time-zone`, `report-period-date-field`, `group-delete-any`, `user-visibility`,
  `household-member-visibility`, `quick-scan-config`, `quick-scan-dialog-behavior`, `receipt-note-column`.
- CI's smoke job sometimes fails at *Install the browsers* (the runner cannot reach Ubuntu's servers): re-run it.
- The Browser pane does not render while the Claude window is out of view; photograph with Playwright instead.
- Never run: Safari/Firefox desktop, Lighthouse, Web Push on a real device, the arm64 image on a real machine,
  a sign-in through a real identity provider, a scan with a real AI key by the agent.

## Waiting on the owner (NAS or phone)

The NAS ran `:preview`, so its one-way steps (two roles, one note and two statuses, photos stored by number,
amounts as whole cents) have already happened there. None of the checks below has been confirmed to the agent.

- **Deploying 0.19.0:** pull, redeploy in Dockhand, hard-refresh. The stack needs the new root
  `docker-compose.yml` (no `valkey`; `security_opt`, `cap_drop`, `cap_add`; `stop_grace_period: 30s`), then delete
  the old `cartvibe-valkey` container and `valkey-data` volume. If the container does not start with the three
  security keys on the Synology, remove them and say so.
- **In the log, once:** "receipt files are stored by id now" with "0 not found on disk"; "amounts are stored as
  whole hundredths now: N converted, 0 of them had more than two decimals"; "Listening on :80"; no "image tools
  missing", no "database is locked", no "mkdir …/data/derived: file exists". An `app-upgrade-*.db` and, within
  ten minutes, an `app-daily-*.db` in `sqlite/backups`.
- **Receipts and scans:** a photo, a HEIC and a PDF open on old and new receipts and as an avatar; a Quick Scan
  with a real key is read, also while someone saves a receipt, and finishes after a redeploy; three photos at
  once move through the *Scan queue* on the AI page and the receipts page loses its count; *Read again* under
  *Saved without a read*; a receipt opens ready to edit; a receipt that had comments shows its note; press
  *Download logos* for Fressnapf, Maxi Zoo and Apple.
- **On a phone:** the tab bar, Shop mode keeps the screen on, lists and receipt lines as cards, dialogs as bottom
  sheets with the keyboard not hiding their buttons; in flight mode a list takes adds and cross-offs and a Quick
  Scan puts a number on the Scan button and uploads later; the usual shop order on a later list; nobody has to
  sign in again after the update.
- **Dashboard:** it looks as it did before any change (the old layout converted); dragging by the grip on a touch
  screen; the controls tab not covering a title; the 4K screen (Interface size above *Standard*).
- **Other:** a report as PDF and Excel; a household rename is instant; *Sign out everywhere* makes another
  device ask for the password within 20 minutes; sorting and filtering receipts by amount.
- Behind the HTTPS proxy: install on iPhone and Android, Share, the barcode scanner, recipe import, the upload
  size limit, opening the app with no connection, the list still *Live*, a bookmarked receipt opens. Only with
  an identity provider at home: the FAQ's *How do I sign in with…*. Try an import only on a spare empty server.
- A restore drill of the NAS data (`docs/faq.md`). Search Console: verify `cartvibe.app`, submit the sitemap.
  Around 2026-11-16: DMARC to `p=quarantine` if the reports allow. CSP: switch Report-Only to enforced if the
  console is clean.

## Backlog

Empty on purpose (the owner's word of 2026-11-10).

## Parked (only when the owner asks)

- Signal Forms; native-speaker review of de/fr/es; the Chromium sandbox stays opt-in; "Receipt {date}", ISO report
  months and the full-bleed report builder stay; `feature/households`; a camera inside the page for Quick Scan.
