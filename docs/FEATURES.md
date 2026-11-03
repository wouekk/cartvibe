# CartVibe feature registry

What CartVibe does, in plain words, one row per feature a person can see or use. Each row has a stable ID, the release
that introduced the feature, and what has to be true for it to count as working.

**Who reads this.** Anyone who needs to know what CartVibe does without reading its code: contributors, people asking
for a feature, and other apps that follow CartVibe's behaviour. That is why the rules below are strict.

## Rules for this file

- **Behaviour only.** Describe what a person sees and can do. No code, field, column, table, endpoint, setting or
  package names. No screenshots, no prompt text, no wording of the AI's instructions.
- **No upstream or third-party project names.** Outside services a feature talks to (Open Food Facts, Logo.dev, the AI
  providers) may be named because a person sees them.
- **IDs are forever.** An ID is never reused, renumbered or moved to another area. A feature that is taken out stays as a
  row with the status `retired`.
- **One row, one thing a person would call a feature.** Split a row when its acceptance has two halves that could be
  built or declined separately.
- **Acceptance is what a person can check** ("a crossed-off item shows struck through on every phone"), not how it is built.
- **Keep it current.** A pull request with a user-visible change adds or edits the rows it touches, in the same
  branch, and the changelog entry cites the IDs (see [CONTRIBUTING.md](../CONTRIBUTING.md)). The version column says
  when the feature first shipped; a later change is described in the row.
- **Never refer to any other app's repository or code.** Other apps follow this file; this file does not follow them.

**Status:** `released` (in a tagged version) · `unreleased` (merged, not tagged yet) · `web-only` (released, and about
running the server, so it has no meaning outside a self-hosted instance) · `retired` (taken out; the row says when).

**Version** is the first release that had the feature. "0.1.0" also covers what the project inherited at the start.

## Shopping lists (LIST)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| LIST-01 | Shared lists | Each household has shopping lists. An item has a name, an amount and a unit. Anyone in the household can add, change and remove items. | 0.1.0 | released |
| LIST-02 | Live sync | A change on one phone shows on every other phone that has the list open, without a refresh. | 0.1.0 | released |
| LIST-03 | Crossing off | Ticking an item crosses it off and moves it to a folded group of crossed-off items; unticking brings it back. | 0.1.0 | released |
| LIST-04 | Add by pressing Enter | Typing an item name and pressing Enter adds it. With a suggestion highlighted, Enter picks the suggestion. | 0.8.0 | released |
| LIST-05 | Going shopping | A button on a list tells the household, with a notification, that someone is going shopping from it. | 0.1.0 | released |
| LIST-06 | Mark as complete | One button crosses off the whole list (everything bought as planned) and opens the next list. A message offers Undo, which puts back exactly the items it crossed off. | 0.9.0 | released |
| LIST-07 | Past lists | Finished lists are kept. They fold away under a Completed toggle, newest first, the latest six shown. | 0.9.0 | released |
| LIST-08 | Restore a finished list | A finished list's menu brings every item back so the list can be shopped again, or starts a new list from it. | 0.9.0 | released |
| LIST-09 | Open list first | The shopping lists page opens on the list started last and shows the lists still being shopped above the finished ones. | 0.9.0 | released |
| LIST-10 | Delete a list | Deleting the list on screen asks for confirmation, then removes it. | 0.9.0 | released |
| LIST-11 | Keep the screen on | A list's menu can keep the phone's screen awake while shopping. | 0.8.0 | released |
| LIST-12 | Share a list as text | A list can be sent as text to the other apps on the phone, or copied where sharing is not available. | 0.8.0 | released |
| LIST-13 | Shop-friendly feedback | Crossing off an item gives a short buzz on phones that support it. A quiet notice appears when the phone has lost its connection. | 0.8.0 | released |
| LIST-14 | Receipts on a list | A receipt can be attached to the list it was bought from. Items on the receipt that were not on the list count as unplanned spending. | 0.1.0 | released |
| LIST-15 | List preview on the Dashboard | The Dashboard shows the list with the most items still to buy. Tapping an item crosses it off and it leaves the preview at once; an Undo row stays for six seconds. | 0.4.0 | released |
| LIST-16 | Import a recipe | On a list, *Import recipe* reads the ingredients from a recipe page's address or from pasted text, shows them with a portion bar (0.5× to 3×, or a number of servings) and a tick per ingredient to untick (salt, oil), marks what is already on the list, and adds the ticked ones. Quantities add up, a crossed-off item comes back, and an incompatible unit becomes its own row. Nothing is translated and no AI is used. A site that cannot be read hands over to pasting. | 0.16.0 | released |
| LIST-17 | Recipe link from the phone's share sheet | On Android, the installed app accepts a recipe link shared from another app and opens the import with it. | 0.16.0 | released |

## Receipts (RCPT)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| RCPT-01 | Add a receipt by hand | A receipt has a name, a date, a total, who added it (always the signed-in person) and a status. Any family member can add one. The shop shown is the one the AI read, otherwise the name. | 0.1.0 | released |
| RCPT-02 | Receipt photo or PDF | A photo or PDF can be attached. The photo has a menu to preview, rename or remove it. Phone photos in common formats, rotated or very large, are turned into a normal upright image first. | 0.1.0 | released |
| RCPT-03 | Products on a receipt | A receipt's lines are its products: name, quantity and amount. Products can be added, changed and removed right on the receipt page without pressing Edit, and this does not change a settled receipt's total or status. | 0.1.0 | released |
| RCPT-04 | Category and tags per product | Each product has one category and any number of tags, chosen next to its quantity and amount. A new category or tag can be picked at once. | 0.5.0 | released |
| RCPT-05 | Not-yet-split notice | A receipt with no products says to add them there; a partly split one says how much of the total is not covered yet. That part counts as Uncategorized on the Dashboard and in reports. | 0.9.0 | released |
| RCPT-06 | Set the total from the products | When the products add up to more than the total, the page says so and offers one tap to set the total to the sum. The total never changes by itself, since the difference may be a discount. A receipt converted from another currency gets the explanation but no button. | 0.10.0 | released |
| RCPT-07 | Status: To check and Settled | A receipt is *To check* until it is *Settled*. Marking it settled records the day. A receipt read by the AI settles itself. | 0.1.0 | released |
| RCPT-08 | Change the date in place | The date can be changed on the receipt page, settled or not, without pressing Edit, and saves on its own. A receipt converted from another currency still goes through Edit. | 0.11.0 | released |
| RCPT-09 | Comments | A receipt has comments from the people who can see it. A new comment shows at once, also on a receipt opened for viewing. | 0.1.0 | released |
| RCPT-10 | Receipts list | The list shows date, shop, amount, status and who added it, sorted by date by default. Columns can be chosen and sorted, and a filter dialog and the period picker narrow what is shown. | 0.1.0 | released |
| RCPT-11 | Receipt search | Ctrl/⌘ K or `/` opens a typo-tolerant search over names, shops, comments and products. Matching products show under the shop name, and totals and exports follow the search. | 0.4.0 | released |
| RCPT-12 | Several currencies | A receipt can be in another currency, converted at a rate typed in for the day it was added. The household has one main currency. | 0.1.0 | released |
| RCPT-13 | Export receipts | All receipts, or the ones selected, can be exported as a CSV file with one row per receipt. | 0.1.0 | released |
| RCPT-14 | Shop logos | With a free Logo.dev key set by an admin (ADM-07), known shops show their logo beside the name; unknown shops, and every shop before a key is set, show the first letter. Logos load from CartVibe itself and work offline. | 0.2.0 (own key since 0.13.0) | released |

## Scanning and AI (SCAN)

AI is optional in every row: with no AI, a slow one or one out of credit, nothing fails; the receipt stays to be filled
in by hand and the AI is retried later.

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| SCAN-01 | Quick Scan | Photos are dropped or chosen (one row each, with a thumbnail and a remove button) and the dialog closes at once. Receipts are read one at a time in the background and the person is notified for each: ready, with a link, or failed after the last try. Large phone photos are shrunk before upload. | 0.4.0 | released |
| SCAN-02 | Receipt read by AI | The AI reads the shop's own name, date, total and every line, with a category and a health rating per line and whether the line was on the shopping list. Lines add up to the cent; a mismatch is flagged. | 0.1.0 | released |
| SCAN-03 | Shop's own name | The shop is named by its own brand, never the shopping centre it sits in; a name printed only as a logo is read from the logo. Receipts already read keep their names. | 0.16.0 | released |
| SCAN-04 | Any receipt or bill | A taxi ride, flight, toll, hotel stay or energy bill becomes one line per service at the amount paid, in a fitting category. | 0.13.0 | released |
| SCAN-05 | Invoices with prices before VAT | An invoice that lists prices before tax and adds the tax at the bottom gets products at the amount paid, tax included. | 0.13.0 | released |
| SCAN-06 | Read again | A receipt can be read again by the AI; the new read replaces the receipt's products. | 0.1.0 | released |
| SCAN-07 | Categories and health, never tags | The AI assigns categories and a health rating only. It never assigns tags (they are the household's own labels) and never uses a category an admin has switched off for it. | 0.5.0 | released |
| SCAN-08 | Backup AI | A second AI takes over when the main one fails. | 0.2.0 | released |
| SCAN-09 | Scan without an AI | With no AI set up, Quick Scan stays visible and asks whether to add one. | 0.6.0 | released |

## Categories and tags (ORG)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| ORG-01 | Manage categories | Add, rename, switch off for the AI, and delete categories. A rename keeps a category's products. An empty list shows an Add button. | 0.1.0 | released |
| ORG-02 | Starter categories | A new household starts with groceries and everyday spending (restaurants, delivery, taxi, public transport, parking, tolls, flights, trains, hotels, culture, books, bills, phone and internet, subscriptions and more). A category already present under any name is never doubled, and one deleted stays deleted. | 0.13.0 | released |
| ORG-03 | Manage tags | Add, rename and delete household tags. Each shows how many products carry it. | 0.1.0 | released |
| ORG-04 | Tag tile on the Dashboard | A tag can have its own Dashboard tile showing what its products cost in the period and their share of spending, opening the products behind it. Shown by default for a new tag. | 0.5.0 | released |

## Dashboard (DASH)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| DASH-01 | Landing page | After signing in, the Dashboard opens, with a loading screen that fades away once it is ready. | 0.1.0 | released |
| DASH-02 | Period picker | One From / To picker sets the period for every panel and is shared with the receipts list. | 0.1.0 | released |
| DASH-03 | Key figures | Tiles show what was spent (and the change against the previous period), the number of receipts (and how many are to check), unhealthy spending, spending not on the list, items still to buy and warranties, plus one tile per tag chosen for it (ORG-04). Unhealthy, not on the list and each tag open the products behind them. | 0.1.0 | released |
| DASH-04 | Monthly goal | Each person sets a monthly spending goal, on the Spent tile or in their settings. The tile fills up as the month goes on, and the part over the goal shows in red. | 0.1.0 | released |
| DASH-05 | Spending by category | A donut and a legend show each category's share of the period. Pointing at a slice or a legend row highlights it and names it in the middle; with reduced motion the animation is off. Small categories fold into *Other*. | 0.1.0 | released |
| DASH-06 | Trend chart | Bars show spending by month (up to twelve), or by day for a short period, with the goal line and the month and year in the tooltip. For a period longer than a year the chart is replaced by a PDF and CSV export of those years. | 0.1.0 | released |
| DASH-07 | Drill-down | A click on a donut slice or its legend row opens the products behind it; *Other* opens every category it folds, each a section with a subtotal. The Spent tile and each bar of the trend open the receipts list on that date range; the Receipts tile opens it on the period shown. | 0.16.0 | released |
| DASH-08 | Recent receipts | A panel lists recent receipts; shop name and date open the receipt. | 0.1.0 | released |
| DASH-09 | Customise the Dashboard | A Customise button opens edit mode: switch panels on and off, drag them to any column and row, resize within limits that keep charts whole, and preview phone, tablet and desktop widths before saving. The layout belongs to the account and follows it to every device. A phone keeps its own order, with the shopping list first until rearranged. | 0.5.0 | released |
| DASH-10 | Panels that scroll | With a mouse the shopping list and receipts panels scroll inside themselves; on a phone they stay plain lists so a swipe scrolls the page. | 0.11.0 | released |
| DASH-11 | Dashboard currency | The Dashboard shows the household currency an admin sets. | 0.13.0 | released |

## Reports (REP)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| REP-01 | Starter reports | A new household has a few ready-made reports. | 0.1.0 | released |
| REP-02 | Report builder | A report is built by choosing columns and what to cut by (category, tag, health, planned or not, shop, month, year, date, status, who added it and more) with a live preview, and saved as a template that can be reopened. | 0.1.0 | released |
| REP-03 | Cut by product lines | Cutting by category, tag, health or planned divides a receipt by what its products cost; what they do not cover is the empty bucket, so totals stay exact. A receipt cut by a line field counts once per bucket it falls into. | 0.6.0 | released |
| REP-04 | Export a report | A report exports to PDF, CSV or Excel. | 0.1.0 | released |
| REP-05 | Reports in your language | Field names, statuses, totals, the period line and the footer follow the language of the person generating the report. Names a person typed stay as written. | 0.7.0 | released |

## Warranties (WARR)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| WARR-01 | Warranty date | *Add warranty date* on a receipt starts a date picker at the purchase day plus the person's warranty period. Return dates are not tracked on purpose. | 0.13.0 | released |
| WARR-02 | Warranty period | In user preferences a person picks their region and a period of 1, 2, 3 or 5 years; *Automatic* is 2 years in the EU and 1 year elsewhere. | 0.13.0 | released |
| WARR-03 | Warranty reminder | Everyone who can see the receipt is reminded once at 09:00, the chosen number of days ahead (30 unless changed; 0 is the day itself). The reminder names the shop, never the amount. It shows in the app's notifications and, if allowed, as a notification on the device. | 0.13.0 | released |
| WARR-04 | Warranties list and tiles | A Warranties tile and a *Warranties ending soon* panel (the next two months, with days left) open the full list of running warranties, nearest expiry first. | 0.13.0 | released |

## Product check (FOOD)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| FOOD-01 | Check a product | *Check product* reads a barcode with the camera, from a photo of it, or typed in. The live camera stays on the phone's main lens (it never hops between lenses while focusing) and shows two brackets: only a barcode held between them is read. It shows the product's Nutri-Score, NOVA level, additives and nutrition from Open Food Facts in a side panel (a bottom sheet on a phone). Nothing is stored. | 0.4.0 | released |

## Notifications (NOTE)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| NOTE-01 | Notification list | A bell in the header opens a list of notifications (going shopping, scan ready or failed, warranty reminders). All can be marked as read at once. | 0.1.0 | released |
| NOTE-02 | Notifications on the device | If allowed when the first warranty date is added, reminders also arrive as notifications on the device. This needs the app served over HTTPS. | 0.13.0 | released |

## Look, language and the app (APP)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| APP-01 | Day and Night | Appearance is System, Day or Night; a quick toggle in the header switches between Day and Night. The choice is remembered on the device. | 0.1.0 | released |
| APP-02 | Colour palettes | Zinc (the default), Blue, Indigo, Emerald and Violet, each in Day and Night, chosen from the header or Settings → Theme and remembered on the device. | 0.12.0 | released |
| APP-03 | Languages | The whole interface in English, Polish, German, French and Spanish. A missing translation shows the English text. The language is saved with the account and follows it to every device. Until sign-in the interface is in English. | 0.3.0 (German, French, Spanish since 0.7.0) | released |
| APP-04 | Welcome | At the first sign-in a new account picks its language and theme, and an admin the household currency. | 0.6.0 | released |
| APP-05 | Install on the phone | CartVibe can be added to the home screen and opens full-screen like an app, keeping the pages on the device. It picks up a new version the next time a page opens. Receipts and lists are always read from the server. | 0.8.0 | released |
| APP-06 | Phone-first layout | Every page fits phone widths without sideways scrolling, with inputs large enough not to trigger zoom. | 0.2.0 | released |
| APP-07 | Smooth changes | Moving between pages is a short fade, off when the device is set to reduce motion. | 0.8.0 | released |
| APP-08 | Save button halo | A Save button on a form with unsaved changes wears a soft halo until saved; it stays still with reduced motion. | 0.16.0 | released |
| APP-09 | Licence and credits page | About lists the project, its credits and the licence texts of what it ships. | 0.2.0 | released |

## Households and accounts (HH)

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| HH-01 | Household | A household holds its members, receipts and shopping lists. An admin, or someone allowed to, can rename it. | 0.1.0 | released |
| HH-02 | Everyone adds things | Every family member can add receipts and list items. Nothing is split between members; the person who adds a receipt is recorded as who added it. | 0.6.0 | released |
| HH-03 | Household currency | One main currency for the household (EUR, PLN, USD, GBP or CHF to start), chosen by an admin. | 0.6.0 | released |

## Running the server (ADM)

These exist only for whoever runs a self-hosted CartVibe. They have no meaning in an app that has no server of its own.

| ID | Feature | Behaviour and acceptance | Since | Status |
| :--- | :--- | :--- | :--- | :--- |
| ADM-01 | Users and roles | An admin adds people, sets or resets passwords and gives the role Admin or User. There is no "forgot password" email. | 0.1.0 | web-only |
| ADM-02 | Household management | An admin manages households and their members. | 0.1.0 | web-only |
| ADM-03 | Sign-in | People sign in with a name and password; an optional outside sign-in provider can be set up. | 0.1.0 | web-only |
| ADM-04 | System settings | An admin sets the currency and the time zone, among other server settings. | 0.1.0 | web-only |
| ADM-05 | AI setup | An admin picks Claude, Gemini, ChatGPT or a local model, enters the key, picks a model (none is chosen for them), tests the connection, and optionally sets a backup AI. A saved key is shown as dots and is never sent to another provider. | 0.1.0 (providers since 0.7.0) | web-only |
| ADM-06 | Logs and tasks | An admin can see the server's activity log and background tasks. | 0.1.0 | web-only |
| ADM-07 | Shop logos setup | An admin enters the household's free Logo.dev key, sees how many logos are downloaded, downloads now, or deletes the logos while keeping the key. | 0.13.0 | web-only |
| ADM-08 | Backups and deployment | Running on a NAS or a rented server, updating and restoring from backups, as described in the README and the VPS guide. | 0.13.0 | web-only |
| ADM-11 | Export the household | Under System Settings → Export & import, an admin sees how many receipts, products, lists, categories, tags and people there are and how large the photos are, then downloads the whole household as one ZIP of spreadsheet files, with or without the photos and PDFs. The files open in a spreadsheet with every value as it was entered. No passwords or keys are in it. Only admins see the tab; it is not a replacement for backing up the server. | – | unreleased |
| ADM-12 | Import into a new server | On the same tab, an admin uploads a file made by Export on another server and first sees what it holds: how many receipts, products and lists, each person (with an account here, or kept as a name only), which categories and tags already exist, and what will change, such as the currency. The admin says which person in the file they are, then imports. It only works into an empty household (no receipts or lists yet), so the same file cannot be imported twice. The import runs in the background with progress; afterwards every receipt, total, photo, list and goal is as it was, and people kept as a name show as payers but cannot sign in until an admin gives them a password. If anything goes wrong, nothing is changed. | – | unreleased |
| ADM-13 | Date format | Under System Settings → General, above the time zone and the currency, an admin picks how dates look for the whole household: DD/MM/YYYY (the default), MM/DD/YYYY, YYYY/MM/DD, DD.MM.YYYY or YYYY-MM-DD, each shown with today's date. Every date in the app follows it at once, without a reload: receipts, the Dashboard, reports, warranties, shopping trips, comments and filters; a day without its year keeps the same order (03/11), and times follow the app's language. Month names on charts stay words. The calendar used to pick a date is the browser's own and follows the browser's language. | – | unreleased |

## Retired

| ID | Feature | Taken out in |
| :--- | :--- | :--- |
| ADM-09 | API keys for scripts | 0.14.0 |
| HH-04 | Splitting a bill between members (shares, settle-up) | 0.6.0 |
| RCPT-16 | Custom fields on a receipt | 0.6.0 |
| ADM-10 | Reading receipts from an email inbox | 0.6.0 |
| HH-05 | A personal Dashboard currency | 0.13.0 |
