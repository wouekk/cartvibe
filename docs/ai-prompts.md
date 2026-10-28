# AI prompts: what CartVibe asks the AI, and what it gets back

The one place to read before changing anything the AI is asked. Prompts are **code** (Go constants), not database rows:
the "Prompts" table and the prompt a processing setting names are kept for upstream compatibility but **never read**
(Phase 3 A3). Last reviewed 2026-10-22 (branch `feat/item-level-tags-categories`).

## Decisions (by the user, do not undo without asking)

- **The AI assigns categories and the health rating. It never assigns tags.** Tags are the household's own labels, set
  by people (per product line, or picked in Quick Scan). The receipt prompt does not ask for tags, and `dropAiTags`
  (`services/receipt_processing.go`) empties any tags an answer still holds, on the receipt, its items and linked items.
- **A category switched off for the AI** (Manage Categories → "Never let the AI use this category", `categories.skipped`)
  is never offered: it is left out of the receipt prompt's list, the product prompts say "never use", and an answer that
  still names it resolves to Uncategorized.
- **Categories describe product lines** (`receipt_products.category_id`), one per line; the AI names them through
  `foodGroup`. An unknown name becomes a new category (Title Case); an old name (alias) of a renamed category resolves to
  it. A category a person chose (`category_overridden`) is never replaced by the AI.
- **Any receipt or bill, not only a shop's.** A bill for a service (ride, flight, ticket, toll, stay, meal, utility) is
  read as one line per service at the amount paid with its own taxes and fees (`productLineRulesTemplate`), so it lands
  in a category instead of Uncategorized. Only "not a receipt or bill" answers `products:[]`.
- **A starter category list is seeded once** (`repositories/starter_categories.go`, through the data-migration ledger):
  groceries plus everyday spending (Restaurant, Taxi, Airlines, Bills, Travel, ...). An install with a list gets no
  English examples in the prompt (see `foodGroupRule`); the examples remain for a household that empties its list.
- **Prompts are short, answers are minified JSON.** Output tokens set most of the latency; keys that would be empty are
  left out and the parsers default them.
- **AI is optional and fallible.** Nothing may block or fail because the AI is missing, slow or wrong: record a status,
  retry later, degrade (see "Failure handling").

## The calls

| Call | When | Prompt (Go) | Input | Parser |
|---|---|---|---|---|
| Receipt read | Quick Scan, receipt form Magic Fill, email import | `DefaultReceiptPrompt` (`services/prompts.go`), filled by `buildPrompt` (`services/receipt_processing.go`) | image (vision model) or OCR text | strict `json.Unmarshal` into `UpsertReceiptCommand`, after `splitAiCustomFields` |
| Products, inline | Quick Scan only, same call as the receipt read | `inlineProductPromptTemplate` + `productLineRulesTemplate` (`services/receipt_product_extraction.go`), inserted before `"\nReceipt text: "` | same | `ApplyInlineRead` → `parseProductResponse` |
| Products, sweep | every 30 s for receipts with a pending read (email, uploads, backfill, Read again) | `productExtractionPromptTemplate` + the same rules | image or OCR text | `parseProductResponse` (lenient) |
| Health classification | every minute, up to 60 unclassified product lines / shopping list items per group and month | `foodClassificationPrompt` (`services/food_classification.go`) | names only | `parseClassificationResponse` |
| Shopping trip comparison | every minute, a receipt attached to a shopping list | `shoppingTripComparisonPrompt` (`services/shopping_trips.go`) | list item names + product names | `parseTripComparisonResponse` |

One Quick Scan = **one** AI call (receipt + products + classification). The sweeps are the fallback when the inline
answer has no `products` key, is unreadable, or another sweep already claimed the receipt.

## Shared rule blocks (edit once, both product prompts and the sweep follow)

All in `services/receipt_product_extraction.go`:
- `currencyRule`: ISO 4217 code read from the symbols (zł/zl/PLN=PLN, £=GBP, CHF/Fr./SFr.=CHF, $=USD, €=EUR), amounts
  exactly as printed, never converted (conversion is done in Go with the household's rates).
- `healthRules`: HEALTHY / MEDIUM / UNHEALTHY / NOT_FOOD with example foods for each.
- `seasonalityRuleTemplate`: SEASONAL / OUT_OF_SEASON for fresh fruit and vegetables in Western Europe in the month
  bought; left out for everything else (parser: NOT_PRODUCE).
- `foodGroupRule(categoryBlock)`: with a household category list → "the category, from the list below"; without one →
  English examples ("fresh produce", "dairy", ...). The examples are withheld when a list exists because they made the AI
  answer outside a Polish list, and every unknown name becomes a new category.
- The category list itself is `foodGroupResolver.PromptBlock()` (`services/food_group_categories.go`): allowed names,
  "X instead of Y" for renames, and the switched-off ones.
- `correctionExamples`: up to 40 of the household's own health corrections ("dark chocolate: MEDIUM"), learned when a
  person corrects a rating.

Constants: region `foodClassificationRegion = "Western Europe"`; the month is the receipt's (sweep) or the current one in
the app time zone (Quick Scan, whose date is not known before the read).

## Answer shapes (the contract with the parsers)

Receipt read (keys left out when not read with confidence):
```json
{"name":"...","shopName":"...","currency":"PLN","amount":12.5,"date":"2026-10-21T00:00:00Z","categories":[{"id":3}],"customFields":[{"customFieldId":2,"stringValue":"..."}],"products":[...]}
```
- `date` must be RFC 3339 at midnight UTC (a receipt date is a calendar day).
- `amount` negative for a refund/return/credit.
- `categories`: up to 2 ids from the offered list (`[{id, name, description?}]`); id-only answers are resolved to names.
- `customFields`: one value per field by type (`stringValue`, `dateValue` yyyy-MM-dd, `selectValue` option id,
  `currencyValue`, `booleanValue`); read leniently, a bad value is dropped, never fails the receipt.
- `products` only with the inline part (Quick Scan).

Product line (inline or sweep; sweep answers also carry `shop` and `currency`):
```json
{"name":"LAIT DEMI-ECR 1L","displayName":"Semi-skimmed milk 1 L","amount":1.09,"quantity":"1","health":"HEALTHY","foodGroup":"Nabiał","seasonality":"SEASONAL"}
```
- `name` as printed (required; a nameless line is dropped), `displayName` plain English.
- `amount` after the line's own discount; text like "1,09 €" is accepted.
- `quantity`, `seasonality` may be left out. A line without a usable `health` is left for the classification sweep.

Classification: `{"products":[{"id":"1","health":"...","foodGroup":"...","seasonality":"..."}]}`, one entry per id given.
Trip comparison: `{"products":[{"id":"1","listItemId":"2"},{"id":"2","listItemId":null}]}`; an answer that skips a
product is an error (guessing "unplanned" would overstate unplanned spend).

## Models and sampling (`api/internal/ai/`)

- Providers: Gemini (`google.golang.org/genai`), OpenAI-compatible (OpenAI, LM Studio), Ollama. Vision models get the
  images, others the OCR text (Tesseract).
- Temperature 0 everywhere (OpenAI; Ollama in `options.temperature`, its native API ignores the top-level key), except
  **Gemini 3**, which keeps its default 1.0 on Google's guidance (`geminiTemperature`).
- Gemini thinking is turned down (`geminiThinkingConfig`: 2.5 Flash off, 2.5 Pro 128 tokens, Gemini 3 LOW); a 400 retries
  once without it.
- `EnforceJsonResponseFormat` (processing setting, on by default) sends the JSON response mode; off for servers that
  reject it (LM Studio).
- The primary processing setting is tried first, then the fallback ("backup AI").

## Failure handling

- **Outage** (no AI configured, network, out of credits): status UNAVAILABLE, retried hourly, not counted as an attempt;
  product reads give up after 14 days.
- **Unreadable answer**: retried after 10 minutes, FAILED after 3 attempts (classification: 3 attempts per product, then
  left unclassified).
- Sweeps claim rows with a conditional UPDATE and a 30-minute lease, so two sweeps never read the same receipt.
- No system task rows for sweeps (a new `SystemTaskType` would break the closed enum); the extraction row's
  `status`/`lastError` is the record. Quick Scan writes CHAT_COMPLETION system tasks: their durations, in the Logs tab and
  System Tasks, are how to measure prompt speed.

## Changing a prompt safely

1. Keep the answer keys the parsers read (above), or change the parser in the same commit.
2. Keep the anchors code relies on: the receipt prompt's `"\nReceipt text: "` (the inline products go before it) and the
   template variables `@categories`, `@currentYear`, `@ocrText` (`structs/prompt_template_variable.go`;
   `@tags` still exists but the default prompt does not use it; the prompt is code, there is no stored-prompt table).
3. Prefer editing a shared rule block over copying text into one prompt.
4. Run the tests that pin prompt content and parsing: `services/receipt_prompt_test.go`, `food_classification_test.go`,
   `food_group_categories_test.go`, `receipt_product_extraction_test.go`, `receipt_product_inline_read_test.go`,
   `quick_scan_ingest_test.go`, `receipt_processing_grant_test.go`, `ai/gemini_test.go`
   (`api/scripts/go-without-cgo.sh test ./internal/services/ -run '...'` on the Windows PC).
5. Check a real scan on the NAS and compare CHAT_COMPLETION durations before/after.

## Where the AI's output lands (for reports and visualisations)

| Data | Table / field | API |
|---|---|---|
| Receipt total, date, shop | `receipts.amount` (decimal string on the wire), `date` (calendar day, midnight UTC), `shop_name` | `GET /receipt/{id}`, paged `POST /receipt/group/{groupId}` |
| Product lines | `receipt_products` (`name`, `display_name`, `amount` nullable, `quantity`, `position`) | `GET /receipt-product/receipt/{receiptId}` |
| Line category | `receipt_products.category_id` (nullable = Uncategorized) + `food_group` (its name, kept in sync) | same; categories: `GET /category/` |
| Line tags (people only) | `receipt_product_tags` (`receipt_product_id`, `tag_id`) | same (`tags[]`); tags: `GET /tag/` |
| Health, seasonality | `receipt_products.health`, `seasonality`, `classified_at`, `classification_overridden` | same |
| Planned or not | `receipt_products.planned` (nullable), `matched_shopping_list_item_id` | same |
| Dashboard figures | folded in Go (never SQL `SUM`, SQLite has no decimal type) | `GET /overview/group/{groupId}?from=&to=` (`total`, `categories[]` with `categoryId`, `tags[]` tiles, `unhealthyTotal`, `unplannedTotal`, `trend`); lines behind a figure: `GET /overview/group/{groupId}/products?kind=UNHEALTHY|UNPLANNED|FOODGROUP|TAG` |

Rules any consumer must keep: amounts are `shopspring/decimal` strings; lists are `[]`, never null; health, seasonality,
statuses and kinds are plain strings (a new value may appear); visibility is decided server-side per user (paid-by,
category/tag grants), so read through the API rather than the SQLite file when the reader is a person.
