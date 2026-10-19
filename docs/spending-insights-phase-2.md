# Spending Insights — Phase 2 Design (draft for review)

Status: **draft, not approved** (2026-10-20). Builds on Phase 1 (shopping lists) and the existing AI
integration (receipt processing settings, prompts, asynq background tasks).

## What the user asked for

1. **Attach a receipt to a shopping list.** From a list: "Attach receipt", which uploads a photo or picks an
   existing receipt.
2. **Overspending type 1: unplanned purchases.** AI compares the receipt's products with the shopping list.
   Anything bought that was not on the list is *unplanned*. A receipt with no list attached counts as
   **fully planned**.
3. **Unhealthy spending.** Every product is tagged **healthy / medium / unhealthy**. Fruit and vegetables
   also get **seasonal** (in season in Europe this month) or **imported / out of season** (most likely
   frozen or flown in). The same subtle tags appear on shopping list items as they are added.
4. **Overspending type 2: monthly spending goals** that the user sets. Spending past a goal is flagged.
5. **When the AI is unavailable** (not configured, out of credits, or down), the photo is stored and the
   expense counts as planned. The analysis runs automatically once the AI is available again.

## Key fact about today's data

Receipts do **not** store products. Today's AI step extracts only name, total, date, categories and tags,
and `Item` rows are bill-splitting shares, not products. Phase 2 therefore adds product extraction, and
offers a backfill for older receipts that still have their image.

## Data model (new tables, SQLite-safe; amounts are `decimal`)

- **`ReceiptProduct`**: one product line on a receipt.
  - Fields: `receiptId`, `name` (as printed, e.g. "LAIT DEMI-ECR 1L"), `displayName` (cleaned up, e.g.
    "Semi-skimmed milk 1 L"), `amount`, `health` (`HEALTHY` | `MEDIUM` | `UNHEALTHY` | `UNKNOWN`),
    `foodGroup` (e.g. "sweets & snacks", "fresh produce"; free text), `seasonality` (`SEASONAL` |
    `OUT_OF_SEASON` | `NOT_PRODUCE`), `planned` (`true` / `false` / null = not compared),
    `matchedShoppingListItemId`, `healthOverridden`.
  - All the enum-like fields are **plain strings on the API**, never enums: the mobile-outage rule.
- **`ShoppingTrip`**: a receipt attached to a list.
  - Fields: `shoppingListId`, `receiptId`, `attachedAt`, `analysisStatus` (`PENDING` | `DONE` |
    `UNAVAILABLE` | `FAILED`), `analysisError`, and **`plannedSnapshot`**: the list's items at attach
    time.
  - The snapshot matters because the list keeps changing after the trip.
  - "Planned" = the items crossed off during this trip, plus anything still open on the list.
- **`ShoppingListItem`** gains `health`, `seasonality` and `classifiedAt`. These are filled
  asynchronously, so adding an item stays instant and the tag appears a moment later.
- **`ProductHealthOverride`**: the user's corrections (normalized product name → health), per group.
  - They are applied before the AI is asked, and given to the AI as examples, so it learns your view
    (e.g. "dark chocolate = medium").
- **`SpendingGoal`**: `groupId`, `categoryId` (null = the whole month), `monthlyAmount`.

## How the AI work runs

Everything is a background task on the existing asynq queues, using the group's receipt processing
settings (the same AI connection as Quick Scan). Each task has its own **prompt**, stored as a normal
Prompt row, so it can be edited on the existing Prompts screen:

1. **Extract products** (per receipt): reads the receipt image, or the stored OCR text, and returns
   product lines.
2. **Classify** (batched per receipt or list item): health, food group and seasonality.
   - The AI is given the **current month** and a **region** (new system setting, default "Western
     Europe", since the app time zone is Europe/Paris).
   - Seasonality uses the month in which the product was bought.
3. **Compare with the list** (per trip): the AI matches receipt products to the planned snapshot and
   copes with abbreviations, other languages and brands ("LAIT DEMI ECR" = "Milk").
   - Unmatched products become `planned = false`.
   - The money spent on them is the trip's **unplanned spend**.

**AI unavailable** (no settings, quota/429, network error): the trip gets `UNAVAILABLE` and the receipt's
expense counts as planned. A scheduled task retries pending work (e.g. every hour, giving up after 14 days
and marking it `FAILED` with a "re-run" button). Nothing blocks the user.

**Backfill:** a "Analyse older receipts" button queues product extraction for receipts that have an
image and no products yet. It uses AI credits once per receipt, and the system task log shows the
progress.

## What the user sees

- **Shopping list:**
  - an "Attach receipt" action;
  - each item shows small `healthy` / `medium` / `unhealthy` and `seasonal` / `imported` chips;
  - after a trip, a summary such as "€12.40 not on the list: Chocolate, Crisps".
- **Receipt view:** a Products section with the tags and planned/unplanned markers; you can tap a tag to
  correct it.
- **Overview page (new tiles and cards):**
  - **Unplanned spend** this month;
  - **Unhealthy share** (% of food spend);
  - **Goals**, shown as progress bars;
  - an **AI insights** card summarizing the month in a few sentences (generated once per day, cached).
- **Spending goals screen:** set a monthly goal overall and per category.

## Permissions

- Attaching a receipt needs `group.shopping-lists.update` **and** `group.receipts.create` (or
  `group.receipts.read` when picking an existing receipt).
- Goals: `group.spending-goals.{read,update}`. Legacy Viewer gets read, and Editor gets read and update.
- Health corrections ride on `group.receipts.update`.

## Privacy

Product names and receipt images go to the AI provider configured in Receipt Processing Settings. That is
the same provider Quick Scan already uses, so no new third party is involved. With Ollama, everything stays
on the NAS.

## Suggested build order

1. **2a** Product extraction on new scans, plus the backfill button and the Products section on receipts.
2. **2b** Health and seasonality, on products and on shopping list items, with corrections.
3. **2c** Attach receipt to a list, the trip, the planned comparison and the retry queue.
4. **2d** Monthly spending goals.
5. **2e** The new Overview tiles and the AI insights card.

Each step is usable on its own and ships separately.

## Open questions for the user

1. **Region for seasonality:** "Western Europe" (France), or a specific country?
2. **Goals:** overall monthly plus per category, or just one of them?
3. **Which receipts count as "food" for the unhealthy share:** only receipts in a Groceries-type category, or
   every receipt with food products on it?
4. **Unplanned spend:** count every unmatched product, or ignore small amounts (e.g. under €1)?
