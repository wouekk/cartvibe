# The household export format

What **System Settings → Export & import → Download** produces, for contributors. The format is internal: only CartVibe
promises to read its own older versions. Code: `api/internal/backup/` (`export.go` lists every table and column in
order); behaviour: `api/docs/domain.md`, "Household export".

## The ZIP

```
cartvibe-backup-2026-11-03.zip
  users.csv  groups.csv  group_members.csv  categories.csv  tags.csv
  receipts.csv  receipt_categories.csv  receipt_tags.csv  receipt_products.csv  receipt_product_tags.csv
  comments.csv  files.csv  shopping_lists.csv  shopping_list_items.csv  shopping_trips.csv
  classification_overrides.csv  exchange_rates.csv  report_templates.csv  report_template_groups.csv
  user_preferences.csv  dashboard_layouts.csv  group_receipt_settings.csv
  files/<fileId>            the receipt photos and PDFs, when photos are included
  files/trips/<tripId>      the shopping-trip photos, when photos are included
  manifest.json             written last
```

The file name carries the date in the household's time zone. Photos are stored uncompressed (they are compressed
already); the CSVs are deflated.

## manifest.json

| Field | Meaning |
| :--- | :--- |
| `format` | Always `cartvibe-backup`. |
| `formatVersion` | `1`. Changes only for a breaking change (below). |
| `appVersion`, `exportedAt`, `exportId` | The server's version, the moment in RFC 3339 UTC, a random UUID. |
| `includesFiles` | Whether `files/` is there. |
| `household` | The currency display, its ISO code (empty for a custom symbol), separators, symbol position, hidden decimals, the time zone and the date format. |
| `allGroupIds` | The ids of the synthetic All group, which is never exported as a group; a report template covering it names it. |
| `entries` | Every other entry with its `kind` (`table` or `file`), `rows` (tables), `bytes` and `sha256`. |
| `missingFiles` | Photos deleted while the export ran; they have a row in `files.csv` but no entry. |

## CSV files

- RFC 4180, UTF-8 with a byte-order mark (so spreadsheets read accented text), CRLF line ends, a header row.
- Ids are the exporting server's own; rows refer to each other by them (`receipts.group_id` → `groups.id`). Lists of ids
  are link tables (`receipt_tags.csv`), never a comma-joined cell.
- Calendar days are `yyyy-MM-dd` (receipt `date`, `warranty_until`; a receipt date is the day as written, stored as
  midnight UTC). Moments are RFC 3339 in UTC with full precision (`created_at`, `resolved_date`, `checked_at`).
- Money and rates are decimal strings with a dot, exactly as stored (`43.21`, `-2.5`). A receipt `amount` is in the main
  currency; `original_amount`, `original_currency` and `exchange_rate` keep what was converted.
- Booleans are `true` / `false`. An empty cell is null.
- People, groups, categories and report templates carry names; roles are named (`app_role`, `group_role`), never ids.
- `files.csv` names the entry of each file in `file` (empty without photos). `shopping_trips.csv` does the same in
  `photo`; the server path of the photo is never written.

### Formula escape

A cell is guarded against spreadsheet formulas reversibly: a value starting with `=`, `+`, `-`, `@`, a tab or a carriage
return (unless it is a plain number such as `-2.50`), **or with an apostrophe**, gets one leading `'`. A reader takes
exactly one leading `'` off. Since every value that starts with `'` is escaped, the round trip is exact
(`Escape` / `Unescape` in `api/internal/backup/csv.go`).

## What is never in it

Password hashes, AI processing settings and their keys, the Logo.dev key, OIDC providers and sign-in links, Web Push
subscriptions, refresh tokens and OAuth rows; notifications, background tasks and their history, receipt edit history,
product-read state, warranty reminders (rebuilt from the receipts), roles and grants (every server seeds its own), the
data-migration ledger and the shop logos (downloaded again).

## Versions

- Readers match files and columns **by name** and ignore the ones they do not know; a missing column takes the default
  that reproduces the old behaviour (the same rule as the database migrations).
- An additive change (a new column or table) keeps `formatVersion`.
- A breaking change (a renamed or re-meant column) bumps it, and the reader gets an upcaster from the older version.
- A reader refuses a `formatVersion` newer than its own ("update CartVibe first"), an entry name that could leave a
  folder (`..`, an absolute path, a backslash), and an entry whose size or SHA-256 differs from the manifest.

## How an import reads it

`api/internal/backup/parse.go` reads the tables back; `import.go` writes them. The rules a change to the format must
keep:

- Every id in the file is the exporting server's. The import gives each row a new id and rewrites the references,
  including the ids inside a report template's `configuration` (`groupIds`, the filter's `group`, `paidBy`, `categories`,
  `tags`) and the tag panels (`tag:<id>`) of a Dashboard `layout`. A template whose ids cannot be mapped is skipped.
- A row that cannot be read, or that points at a row the file does not have, is a *problem*: the preview lists it and
  the import does not start.
- People are matched by `username`, categories by name or any old name in `aliases`, tags by name (case-insensitive).
- A receipt file row is written only when its photo is in the ZIP, so no receipt points at a missing image.
- `manifest.household` sets the currency, time zone and date format of the server it is imported into.
