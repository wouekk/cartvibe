# Family Budget Rework — Phase 3 Plan

Status: **approved** (2026-10-20), from the user's first hands-on test on the NAS. Decisions are at
the end. Nothing here is built yet; it comes **before** 2d.

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
- **Re-tested on the current image (2026-10-20): the landing page and the Manage links work.** B2
  and B3 were the old image only.

## Reported problems

| # | Report | Notes |
|---|---|---|
| B1 | Log noise at startup: `queue "email_receipt_image_cleanup" does not exist` (INFO, twice) | `retireEmailReceiptImageCleanupQueue` in `wranglerasynq/clean_up.go` asks Redis to empty a queue that never existed on a fresh install. Harmless; treat "queue does not exist" as nothing to do. |
| B2 | Every Manage link except System Settings and Imports does nothing | **Resolved:** old image only; works on the current one. |
| B3 | Cannot manage users, so no way to create a test account | **Resolved** with B2. The user creates the test account by hand. |

## Requested changes

| # | Change | Where |
|---|---|---|
| R1 | **Landing page = the design's Dashboard**: tiles (spent this month, receipts, unhealthy spend this month, to buy), spending by category, last 6 months, recent receipts, shopping lists. Ready out of the box, no setup. Rename "Overview" to **Dashboard**. | desktop `src/overview/`, sidebar |
| R2 | **Replace the Settle up tile with "Unhealthy this month"**: money spent on products tagged unhealthy (from 2b). The family does not share bills. | API overview + desktop; overlaps 2e |
| R3 | **Paid by is the logged-in user**, filled in automatically and not asked for on any form (receipt form, Quick Scan, trip upload already does it). | desktop forms; group receipt settings defaults |
| R4 | **Hide bill splitting**: item shares, "who owes whom", settle up, paid-by columns and filters. Kept in the database, not offered in the UI. | desktop receipts, overview |
| R5 | **Receipt statuses become "To check / Done"** (decision Q2). The five upstream statuses are an approval workflow for shared expenses. Map OPEN, NEEDS_ATTENTION and DRAFT to "To check", RESOLVED to "Done" (DECLINED: hide, or "Done"; decide when building). AI-read receipts start as "To check" so someone looks them over. **Display-only mapping:** the API keeps its `ReceiptStatus` enum unchanged (closed enum, released clients). | desktop receipts, filters, overview tile |
| R6 | **Shopping list add row on one line**: name, amount, unit and the add button side by side, as in the design (`Phone.dc.html`); no "tune" toggle to reveal amount. Items show the amount as a chip on the right. | desktop `shopping-list` |
| R7 | **AI works out of the box.** Prompts, OCR engine and processing details stay under the hood with good defaults. The only AI setting is choosing the model (and its key), and only an admin sees it. Providers to offer (decision Q3): **Google Gemini** (native `GEMINI`), **Claude** and **LM Studio**. LM Studio runs on the user's PC and is reachable from the NAS (it also backs their Open WebUI): use the existing OpenAI-compatible type (`OPEN_AI_CUSTOM`, base URL like `http://<pc>:1234/v1`). Claude has no native type, and adding a value to the `AiClientType` enum is ruled out. Go through Anthropic's OpenAI-compatible endpoint (`https://api.anthropic.com/v1/`) with `OPEN_AI_CUSTOM`. Verify that it handles images, or keep Claude to the text-only tasks (classification, comparison). The admin picks one of these three presets plus a key or URL; prompts, OCR and the rest are fixed defaults. | API seed/defaults; desktop System Settings, group AI settings |
| R8 | **Reports like the dashboard**: a few ready-made, simple reports (month, category, unplanned, unhealthy) for every member. The Report Builder and its customisation are admin-only. | desktop reports, sidebar |
| R9 | ~~Two seeded accounts~~ **Dropped** (decision Q1): the user creates a family-member test account in Manage Users. Nothing is seeded. | — |
| R10 | **Family language everywhere**: "Group" is the family/household; members, not users, in the everyday UI; business wording removed. | desktop copy |

Also keep in mind for every change: a family member (not admin) should see Dashboard, Shopping Lists,
Receipts and Reports, and nothing they cannot use.

## Suggested order

1. Quick fixes: B1, R3, R6, R2.
2. The rework proper: R4, R5, R7, R8, R10, R1 polish to match the design.
3. Then 2d (goals) and 2e (overview tiles), which slot into the new dashboard.

## Decisions (answered by the user, 2026-10-20)

- **Q1 — test accounts:** none seeded. The user creates the family-member account in Manage Users.
- **Q2 — statuses:** keep a minimal **"To check / Done"** (R5).
- **Q3 — AI:** Google Gemini, Claude, and an LM Studio server on the user's PC (R7).
- **Q4 — order:** the rework first, then 2d. Not started 2026-10-20; next session.
