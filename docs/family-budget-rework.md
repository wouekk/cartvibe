# Family Budget Rework — Phase 3 Plan

Status: **draft** (2026-10-20), from the user's first hands-on test on the NAS. Open questions are
at the end; nothing here is built yet.

## Why

Upstream Receipt Wrangler is built for expense tracking: shared bills, who paid, who owes whom, a
receipt approval workflow, configurable AI prompts. This fork is for **one family's grocery budget**.
Users are family members, everyone can add things, and nobody splits bills. The app should feel like
the approved design, not like a business tool with extras.

**The target look is the approved design** (`Main.dc.html` desktop dashboard and `Phone.dc.html`
shopping list, in the design artifact https://claude.ai/artifact/TAZXoRQ4mmRyoy37CFKRVt). The user
wants "exactly something like this".

## First: what the user actually saw

The first test ran an **old image**. The sidebar in the screenshot is the light one with a
"Dashboard" item, from commit `9808c4d9`. That is before the Overview landing page and the dark
sidebar (`99f984fd`), and before 2a–2c. Dockhand had redeployed its cached `:latest` without pulling.

- Deploy = **pull, then redeploy** (Dockhand's pull action, or `docker compose pull`), then a hard
  refresh in the browser. Recorded in `AGENTS.md` §2.
- Re-test on the current image before acting on the points below that may already be fixed (the
  landing page, the dashboard, possibly the Manage links).

## Reported problems

| # | Report | Notes |
|---|---|---|
| B1 | Log noise at startup: `queue "email_receipt_image_cleanup" does not exist` (INFO, twice) | `retireEmailReceiptImageCleanupQueue` in `wranglerasynq/clean_up.go` asks Redis to empty a queue that never existed on a fresh install. Harmless; treat "queue does not exist" as nothing to do. |
| B2 | Every Manage link except System Settings and Imports does nothing | Seen on the old image. Re-test on the current one; if it persists, it is a routing or guard bug in the sidebar's `manageNavItems` links. |
| B3 | Cannot manage users, so no way to create a test account | Follows from B2. |

## Requested changes

| # | Change | Where |
|---|---|---|
| R1 | **Landing page = the design's Dashboard**: tiles (spent this month, receipts, unhealthy spend this month, to buy), spending by category, last 6 months, recent receipts, shopping lists. Ready out of the box, no setup. Rename "Overview" to **Dashboard**. | desktop `src/overview/`, sidebar |
| R2 | **Replace the Settle up tile with "Unhealthy this month"**: money spent on products tagged unhealthy (from 2b). The family does not share bills. | API overview + desktop; overlaps 2e |
| R3 | **Paid by is the logged-in user**, filled in automatically and not asked for on any form (receipt form, Quick Scan, trip upload already does it). | desktop forms; group receipt settings defaults |
| R4 | **Hide bill splitting**: item shares, "who owes whom", settle up, paid-by columns and filters. Kept in the database, not offered in the UI. | desktop receipts, overview |
| R5 | **Receipt statuses** (Open / Needs attention / Resolved / Draft / Declined) are an approval workflow for shared expenses. The user asked what they mean; see question Q2. | desktop receipts |
| R6 | **Shopping list add row on one line**: name, amount, unit and the add button side by side, as in the design (`Phone.dc.html`); no "tune" toggle to reveal amount. Items show the amount as a chip on the right. | desktop `shopping-list` |
| R7 | **AI works out of the box.** Prompts, OCR engine and processing details stay under the hood with good defaults. The only AI setting is choosing the model (and its key), and only an admin sees it. | API seed/defaults; desktop System Settings, group AI settings |
| R8 | **Reports like the dashboard**: a few ready-made, simple reports (month, category, unplanned, unhealthy) for every member. The Report Builder and its customisation are admin-only. | desktop reports, sidebar |
| R9 | **Two accounts to test with**: an admin and a plain family member. See question Q1. | API seed or docs |
| R10 | **Family language everywhere**: "Group" is the family/household; members, not users, in the everyday UI; business wording removed. | desktop copy |

Also keep in mind for every change: a family member (not admin) should see Dashboard, Shopping Lists,
Receipts and Reports, and nothing they cannot use.

## Suggested order

1. Re-test on the current image (B2/B3 may be gone, R1 may be mostly there already).
2. Quick fixes: B1, R3, R6, R2.
3. The rework proper: R4, R5, R7, R8, R10, R1 polish to match the design.
4. Then 2d (goals) and 2e (overview tiles), which slot into the new dashboard.

## Open questions

- **Q1 — test accounts.** Seed `admin/admin` and `test/test` in every install, or create the second
  one by hand once Manage Users works? Fixed passwords ship in a public image.
- **Q2 — statuses.** Drop them from the UI (every receipt simply counts), or keep a minimal
  "To check / Done"?
- **Q3 — AI provider.** Which model(s) should the admin be able to pick (OpenAI, Gemini, Claude, a
  local Ollama)? This decides the out-of-the-box defaults.
- **Q4 — order.** Rework first, then 2d, or 2d first?
