# Family Budget Rework — Phase 3 Plan

Status: **approved** (2026-10-20), from the user's two rounds of feedback after testing
on the NAS. Decisions are at the end. Steps 1 and 2 are built; the rest is not built
yet. It also absorbs the rest of Phase 2: **2d (monthly goals) and 2e (dashboard tiles) are part of
this plan** (G1, D4), since both land on the Dashboard this plan rebuilds.

## Why

Upstream Receipt Wrangler is built for expense tracking: shared bills, who paid, who owes whom, a
receipt approval workflow, configurable AI prompts. This fork is for **one family's grocery budget**.
Users are family members (the user and his wife), everyone can add things, and nobody splits bills.
The app should feel like the approved design, not like a business tool with extras.

**(Superseded: the target look is now the fintech identity in AGENTS.md. The original wording follows.) The target look is the approved design** (`Main.dc.html` desktop dashboard and `Phone.dc.html`
shopping list, in the design artifact https://claude.ai/artifact/TAZXoRQ4mmRyoy37CFKRVt). The user
wants "exactly something like this".

**Principle for every change:** hide what a family does not need rather than deleting it (the data
and the API stay, so nothing migrates destructively and released clients keep working), fill in what
nobody should have to type, and keep configuration admin-only with working defaults. A family member
who is not the admin sees Dashboard, Shopping Lists, Receipts and Reports, and nothing they cannot use.

## First: what the user actually saw

The first test ran an **old image** (light sidebar, "Dashboard" item, commit `9808c4d9`): Dockhand
had redeployed its cached `:latest` without pulling. Deploy = **pull, then redeploy**, then a hard
refresh (`AGENTS.md` §2). Re-tested on the current image: the landing page and the Manage links work.

## Changes by area

### Fixes
| # | Change | Notes |
|---|---|---|
| B1 | Silence `queue "email_receipt_image_cleanup" does not exist` at startup | `retireEmailReceiptImageCleanupQueue` (`wranglerasynq/clean_up.go`) empties a queue that never existed on a fresh install; treat "does not exist" as nothing to do. |

### Dashboard (landing page)
| # | Change | Notes |
|---|---|---|
| D1 | **The design's Dashboard**, ready out of the box: tiles (spent, receipts, **unhealthy**, to buy), spending by category, the trend, recent receipts, shopping lists. Rename "Overview" to **Dashboard**; the upstream widget dashboards become admin-only or go. **Any period, not just a month** (decision Q10): a range picker with presets **This month, Last week, Last month, This year, Last year, Custom** (from–to); every tile, the category split and the product lists follow the range, compared with the period before it; the trend shows months (days for a range under a month). The API takes `from`/`to` days instead of only `month`. It is also the family's report (M6): tapping Unhealthy, Unplanned or a category lists the products or receipts behind it. | desktop `src/overview/`, sidebar |
| D2 | **"Unhealthy this month" replaces Settle up**: money spent on products tagged unhealthy (2b), shown as overspending. Settle up goes entirely: the family does not share bills. **Keep the "To buy" tile**: the user likes it, a list grows over a few days and "20 items" says it is time to go shopping. | API overview + desktop; overlaps 2e |
| D3 | **"Add receipt" and "New list" buttons on the Dashboard.** The sidebar's "+ New" menu goes. | desktop overview, sidebar |

### Shopping lists
| # | Change | Notes |
|---|---|---|
| S1 | **Add row on one line**: name, amount, unit and the add button side by side (`Phone.dc.html`); no "tune" toggle. Items show their amount as a chip on the right. | desktop `shopping-list` |
| S2 | **Lists instead of tabs.** The tab bar is clunky. When every item on a list is crossed off, the list moves to **Past lists** at the bottom; the last 2–3 stay visible there. A list is **one shopping trip** (decision Q8), but **several lists can be active at once** (e.g. supermarket and pharmacy); the UI shows the active ones as cards, roomy on a phone. A new list can start from a past list's items. | desktop shopping lists; maybe API (a list's "done" state) |
| S3 | **A new list is named "List {date}"** by default (editable). | desktop |
| S4 | **"Going shopping" call to action:** a member announces a trip, and the household is notified to add what they need. | API + notifications (N1) |

### Receipts
| # | Change | Notes |
|---|---|---|
| C1 | **Paid by is the logged-in user**, filled in and not asked for on any form (receipt form, Quick Scan; trip upload already does it). | desktop forms; group receipt settings defaults |
| C2 | **A new receipt is named "Receipt {date}"** by default (editable); the AI's store name replaces it when it reads one. | desktop receipt form |
| C3 | **No mandatory fields beyond the basics.** Group-configured required fields (Quick Scan's required category/tag/status, …) stop being required. With one family group, the group is picked automatically. | group receipt settings defaults; desktop |
| C4 | **Shares are removed from the UI**: item shares, "who owes whom", settle up, paid-by columns and filters. The data stays. | desktop receipts, overview |
| C5 | **One list of what was bought: Products, made editable** (decision Q9). The AI fills it (2a); people fix a line or add one with a quick one-line entry like the shopping list's. The upstream Items section is hidden (its data stays). | API product edit endpoints + desktop receipt form |
| C6 | **Statuses become "To check / Done"** (decision Q2): OPEN, NEEDS_ATTENTION and DRAFT show as "To check", RESOLVED as "Done", DECLINED hidden or "Done" (decide when building). AI-read receipts start as "To check". **Display-only**: the API's `ReceiptStatus` enum is unchanged (closed enum, released clients). | desktop receipts, filters, dashboard tile |

### Categories, tags and custom fields
| # | Change | Notes |
|---|---|---|
| F1 | **Everything the AI fills in is editable and listed.** Manage Categories / Tags / Custom Fields list everything that exists, so a typo or a wrong pick can be corrected in one place. | desktop manage pages (exist; check they are simple enough) |
| F2 | **Custom fields reach the AI automatically.** Categories and tags already go into the receipt prompt (`@categories`, `@tags`); custom fields do not. Add them (name, type, options) so a new field is filled in by the AI with no prompt editing. | API `services/prompts.go` + receipt processing; new `@customFields` handled in code |

### AI setup
| # | Change | Notes |
|---|---|---|
| A1 | **"AI" moves into the Manage menu, as simple as possible.** Cloud: pick the provider and model, paste the API key. Local: a URL and an optional API key. A **Test connection** button answers OK, or not OK with the reason (the API already has a connectivity check command). Admin only. | desktop new page; reuses receipt processing settings |
| A2 | **Providers** (decision Q3): **Google Gemini** (native `GEMINI`) and **LM Studio** on the user's PC, reachable from the NAS (it also backs their Open WebUI), through the existing OpenAI-compatible type (`OPEN_AI_CUSTOM`, base URL like `http://<pc>:1234/v1`). **Claude dropped**: it would need a new value in the closed `AiClientType` enum or a workaround, and the user does not need it. | |
| A3 | **Prompts are hardcoded** and only shaped by categories, tags and custom fields (F2). The Prompts page leaves System Settings; OCR engine and the other processing knobs get fixed defaults. | API defaults; desktop System Settings |

### System settings, users and roles
| # | Change | Notes |
|---|---|---|
| M1 | **System Settings keeps:** general settings, System Email (the user may later read receipts from a mailbox), System Tasks. **Removed:** Prompts (A3), Receipt Processing Settings (folded into the AI page, A1; decision Q5). | desktop system settings |
| M2 | **New Logs tab** in System Settings: the application log, recent lines with a level filter, admin only. The API already writes logs to the `logs` volume. | API endpoint + desktop tab |
| M3 | **Users: profiles for the user and his wife.** Keep user management. Keep OIDC providers (Google sign-in may matter if the app is ever offered to others) but out of the everyday menus. | desktop |
| M4 | **Roles: only Admin and User.** The seeded legacy roles (Legacy Admin/Owner/Editor/Viewer, …) and the role editor go from the UI; one admin role and one member role, with sensible permissions. The permission system underneath stays. A **User** does everything with lists and receipts (including deleting receipts) and manages categories, tags and custom fields; only the **Admin** sees the Logs, user management and the AI page (decision Q6). | API seed roles; desktop roles page |
| M5 | **One Household group** (decision Q7): everyone in it, created and picked automatically; no personal "My Receipts" groups for new users; the group picker and Manage Groups appear only if a second group ever exists. Existing installs keep their groups. | API user/group creation; desktop sidebar |
| M6 | **Reports: the Dashboard is the family's report** (decision Q10): month, category, unplanned and unhealthy for any period are the Dashboard (D1, D4) with its tap-through lists. The report builder, saved templates and PDF/CSV stay **admin-only** (a User has no report permissions); trimming it can wait. | API family roles (done in step 2); D1/D4 |
| M7 | **Currency selection**: one admin setting, "Currency", with a short list (EUR, PLN, USD, GBP, CHF, …) that fills in the existing system settings (`currencyDisplay`, separators, symbol position) from a preset, e.g. EUR = "€", decimal comma, symbol after; PLN = "zł". The raw fields stay available under "Custom". Default EUR (Western Europe). Amounts are stored without a currency, so changing it only changes how they are shown. | desktop System Settings. **To do later (user wants it):** EUR as the API default for new installs, set in `SystemSettingsRepository.GetSystemSettings`' first-run row (not column defaults), with the report tests that assume `$ , .` seeding USD explicitly. |

### Goals and insights (the former 2d and 2e)
| # | Change | Notes |
|---|---|---|
| G1 | **Monthly spending goals** (former 2d, design in `docs/spending-insights-phase-2.md`): optional, overall and/or per category, a monthly amount each. Spending past a goal is overspending (type 2). A **Goals** screen to set them; **a User may set goals** too (budgeting is the point), unless the user decides otherwise. Model `SpendingGoal` (`groupId`, `categoryId` null = whole month, `monthlyAmount`, decimal); totals folded in Go. | API model/endpoints + desktop page |
| D4 | **The remaining dashboard tiles** (former 2e): unplanned spend this month (from 2c), unhealthy share (D2), goal progress bars (G1), and a short AI summary of the month, generated at most once a day and cached. | API overview + desktop |

### Notifications
| # | Change | Notes |
|---|---|---|
| N1 | **The bell notifies the household** when someone creates a list or adds an item to one, scans a new receipt, or announces a shopping trip (S4). Not for your own actions. Uses the existing notification model; the list events already exist. | API notifications + desktop bell |

### Wording
| # | Change | Notes |
|---|---|---|
| W1 | **Family language**: the group is the family/household; members, not users, in the everyday UI; business wording removed. | desktop copy |

## Suggested order

1. **Quick wins:** B1, C1, C2, S1, S3, D2, D3, M7. *(built on `feature/phase-3-quick-wins`)*
2. **Simplify:** C3, C4, C6, A1–A3, M1, M4, M6, W1. *(built on `feature/phase-3-simplify`; M6 became part of D1/D4, decision Q10)*
3. **New:** F2, S2, S4 + N1, M2, C5, D1 polish to match the design.
4. **Goals and insights:** G1, then D4.

Ship each step as its own `feature/` branch and merge it when CI is green, so every step can be
tried on the NAS before the next one starts.

## Decisions (answered by the user, 2026-10-20)

- **Q1 — test accounts:** none seeded. The user creates the family-member account in Manage Users.
- **Q2 — statuses:** a minimal **"To check / Done"** (C6).
- **Q3 — AI:** Google Gemini and an LM Studio server on the user's PC. Claude dropped (A2).
- **Q4 — order:** the rework first, then goals and insights, all within Phase 3 (2d/2e merged in).
  Not started 2026-10-20.
- **Q5 — receipt processing settings:** folded into the AI page (A1).
- **Q7 — groups:** one Household group (M5).
- **Q8 — shopping lists:** one list per trip, several can be active at once, finished ones go to
  past lists (S2).
- **Q9 — receipt items:** Products only, made editable; Items hidden (C5).
- **Q10 — reports and periods:** no separate family reports; the Dashboard is the report (M6), for any period chosen with presets or a custom range (D1). The builder stays admin-only.

- **Q6 — roles:** Admin and User only. A User does everything with lists and receipts (including
  deleting), and edits categories, tags and custom fields; only the Admin has the Logs, user
  management and the AI page (M4).
