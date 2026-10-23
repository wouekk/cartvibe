# System Tasks page: filter and receipt update diff

Purpose: the mechanics of System Settings → Tasks & Storage → System Tasks (`src/system-settings/system-task-table/`
and the shared `src/shared-ui/task-table/`). Query side: `../../api/CLAUDE.md` → "System tasks and logs".

## Filter

Type, Ran By, Started At and Ended At, through the shared filter pieces (`app-filter-field`, `utils/filter-form.ts`,
`utils/filter-chips.ts`): a badge-counted Filter button and Reset in the header, a chip row, and
`app-system-task-filter` as the dialog. `SystemTaskTableState.filter` is the one slice they all use.

- **The filter belongs to the page, not to `app-task-table`.** The table has other hosts with their own table
  services, so the filter rides in as an optional `[filterProvider]` **function**. A value input would be one change
  detection late: the page dispatches and calls `getTableData()` in the same turn, so a cleared chip would stay
  applied. Hosts that leave it unbound send no filter.
- **One refresh stream.** `TaskTableComponent.getTableData()` pushes onto a `Subject` that `listenForRefreshRequests()`
  `switchMap`s, with `catchError(() => EMPTY)` on the inner observable (an error through `switchMap` would complete the
  outer subscription and stop every later refresh). Clearing two chips quickly is otherwise a last-response-wins race.
- **"Ran By" is a `list` field, not `users`,** because it prepends a pinned "System" option
  (`SYSTEM_RAN_BY_OPTION_ID = -1`) that matches rows with no `ranByUserId`; the API turns it into an `IS NULL`.
- **The Type picker omits child-only types** (`CHILD_ONLY_SYSTEM_TASK_TYPES`: chat completion, OCR): they are never
  top-level rows, so the option could only return nothing. Keep it in step with `filteredSystemTaskTypes` in the Go
  repository. "Receipt Uploaded" is offered and matches only parentless rows (manual create or duplicate).
- **Hydrated state predates the filter.** The slice was persisted before `filter` existed, so the selectors and the
  `SetSystemTaskFilterField` handler fall back to `buildDefaultSystemTaskFilter()`, a factory (a shared constant
  written into state could be corrupted by a later in-place edit).
- Every filter write outside the dialog goes through `applyFilterChange()`: dispatch, `SetPage(1)`, refetch. The dialog's
  `afterClosed()` does the same.
- **Dates go out as `yyyy-MM-dd`** through `toSystemTaskWireFilter` (over `toDateWireFilter`) where the request is
  built, never in the store: the persisted value returns to the datepicker, which would read a bare day as UTC
  midnight (the previous day west of Greenwich). The server widens a day to the whole day in the app time zone.

## Receipt update diff

A `RECEIPT_UPDATED` row stores the receipt before and after the edit. Its description cell summarizes ("Changed: name,
amount" / "No changes") and opens `app-receipt-update-diff-dialog` (`src/shared-ui/receipt-update-diff-dialog/`): both
receipts as pretty-printed JSON side by side.

- **The description is double-encoded** (`{"before":"<json>","after":"<json>"}`, each side a JSON string), which
  `PrettyJsonPipe` cannot print. `parseReceiptUpdateDescription` (`src/utils/receipt-update-description.ts`) parses each
  side once more and never throws; a failed update stores plain error text, returns `undefined` and renders through
  `app-pretty-json` like every other task.
- `TaskTableComponent.receiptUpdates` parses once per page (a `computed` keyed by task id), not per CD pass.
- **The summary ignores bookkeeping fields at every depth** (`id`, `createdAt`, `updatedAt`, `createdBy`,
  `createdByString`): an update recreates nested rows with new ids and timestamps on every save. The diff itself stays
  raw.
- **The diff is hand-written** (`src/utils/line-diff.ts`): trim common prefix and suffix, Myers O(ND) on the rest with
  O(D²) memory; removed/added runs pair up as `changed` rows with `inlineChange`. `line-diff.spec.ts` fuzzes it against
  a reference LCS, so a regression that stays valid but stops being minimal still fails. No dependency added.
- "All lines" is the default; "Changes only" (`collapseUnchanged`, 3 lines of context) folds longer runs into "⋯ N
  unchanged lines" (a run of one line is shown).
- The code cell's content is on one template line: the column is `white-space: pre-wrap`, so template whitespace would
  render.
- **Versions.** The API writes `version: 2`; a row without it is version 1, whose "before" is incomplete, and the
  listing may rebuild it from an earlier complete copy (`beforeSource`). `receiptUpdateBeforeState` gives `complete`
  (no notice), `rebuilt` (names the copy and its date) or `incomplete` (item categories, tags and field names may show
  as changed when they were not). The notice (`receipt-diff-version-notice`, `data-before-state`) sits inside the
  scroll box above the table.

## Activity source files

A failed quick scan keeps its image so the user can enter the receipt by hand (`../../api/docs/activity-source-files.md`). `app-task-table` shows preview/download controls behind `[showSourceFileActions]="true"` (only the System
Tasks page passes it). They gate on the row's `hasSourceFile`, which the server resolves per caller, so a button never
shows where the endpoint would 403. (Any client-side group gate must use the row's own `groupId`: the synthetic "All"
group never appears in `groupPermissions`.) Preview opens
`SourceFileViewerDialogComponent`; download reads the file name from `Content-Disposition` via
`filenameFromContentDisposition` (`src/utils/file.ts`).
