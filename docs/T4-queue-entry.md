# T4 queue entry (to paste into cartvibe-cloud docs/tasks/QUEUE.md)

The agent session had no write access to `wouekk/cartvibe-cloud` (push returned 403), so the queue entry is kept here until the owner copies it. Delete this file afterwards.

### T4. Demo subpage: review
Repo `wouekk/cartvibe`, branch `feature/demo-site` from `preview` (pushed, not merged). Brief: `docs/tasks/T4-demo-brief.md`.
Why `review` and not `done`: (1) the two workflow patches (`pages.yml` builds and publishes `/demo/`, `ci.yml` builds the
demo and runs `check:demo`) are in `docs/site.md` of the code repo for the owner to apply, so until then CI does not run
the bundle check and nothing publishes the demo; (2) this session could not read CI itself (the anonymous GitHub API was
rate-limited from the sandbox's shared IP, no token in the environment). The owner reported CI green on `214707c`; the
later commit `2c1e719` (review fixes) has no CI result read yet. Read it, then merge into `preview` (not `main`).
What was built: the real app with `ng build --configuration demo` on an in-memory API (`desktop/src/demo/`, guide
`desktop/docs/demo.md`): one sample household (14 receipts with product lines over six months, categories, health labels,
three shopping lists, two warranties, a 650 EUR goal, three report templates), scripted AI for Quick Scan, Magic Fill,
"Read again" and trip photos, a "Demo, nothing is saved" banner with Reset, hash routing, prefixed storage, no request
leaves the page, service worker and manifest off, real zip/CSV/XLSX/PDF downloads, five languages. "Try the demo" link in
the site nav, footer and hero.
Ran in this session (Node 24.22.1, as CI): full desktop specs `test:ci` on the first commits (314 files passed, first run; 314 files passed again on `2c1e719`), demo specs (74 incl. the report dialog spec) on `2c1e719`, `i18n:check`,
`ng build` and `ng build --configuration demo`, `check:csp`, `check:demo` (also shown to fail when pointed at a build that
contains the markers), `e2e:demo` 10 of 10 (Chromium from `/opt/pw-browsers`, built demo served like Pages), screenshots at
360 and 1280 px, day and night, Zinc, Emerald and Violet. Not run: Safari, Firefox, Lighthouse, a Pages deploy, Excel or
Acrobat on the downloads, the cell lint (nothing under `api/` changed).
Reviewer (`cartvibe-reviewer`) verdict "merge after fixes"; fixed in `2c1e719`: warranty end sent as a bare day (every
warranty read "Today"), a report counted lines twice per tag outside tag reports (547.08 instead of 529.72; spec now fails
without the fix), list amounts no longer rounded as money, "Open full receipt" in the report drill-in goes through the
router's location (same path in the real app), the e2e origin check and Reset check made stricter, PDF accents, bad JSON
part, deleting a user deletes their receipts, banner buttons 36 px. Left on purpose and listed in `desktop/docs/demo.md`
("Known gaps"): minor filter and report-engine differences from the Go code, English-only report labels, about 20
untranslated error messages for stale ids, no Reset confirmation, the 9 endpoints the UI never calls (role writes, OIDC).
Decision for the owner: the About page links and header shortcuts still use absolute paths (they work in the real app, not
under the demo's base); not changed because they are outside the brief.
Done when: the owner applies the two patches, CI is green on the branch head, and it is merged to `preview`.

