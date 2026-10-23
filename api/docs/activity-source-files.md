# Activity source files and the temp sweep

Purpose: how a failed quick scan's upload is kept, previewed, downloaded, rerun and finally removed, and the rules that keep each step safe.

## The temp directory and its sweep

`temp/` holds quick-scan uploads (one per file), short-lived scratch with its own `defer os.Remove`, and the `DebugOcr`
dumps (`services/ocr.go`), which nothing else removes. `HandleTempFileCleanUpTask`
(`wranglerasynq/temp_file_cleanup_handler.go`, `@every 1h` on the clean-up queue) is the only thing that reclaims them.

Classification, in order (the order is the behaviour):

| # | Case | Action |
|---|---|---|
| 1 | a referencing task is still actionable (pending/active/scheduled/retry/aggregating) | keep |
| 2 | else a referencing task is `Archived` | keep until older than retention |
| 3 | else every referencing task is `Completed` | remove now |
| 4 | unreferenced | keep until aged, and only when the reference map is complete |

- Rule 2 before rule 3: a file referenced by a succeeded and a failed task must not be released. `Archived` is the
  rerunnable state and never means deletable.
- Age is file mtime (works after the task leaves Redis; doubles as the grace window before a task is visible).
- A missed task now means deletion, so: every inspector listing pages (`forEachTaskPage`, asynq defaults to 30 per page)
  and processes page by page; a listing error aborts the sweep with zero deletions; an unreadable payload or hitting the
  `tempFileMaxListPages` cap clears `referencesComplete`, which stands down rule 4 only.
- No queue sets `asynq.Retention`; quick scan removes its own upload after the receipt commits. Rule 3 stays (pure,
  cheap) but has nothing to act on today.
- `TempFileRetentionHours`: default 720, bounds 24-8760, `0` = unset, a pointer field (see `sessions-cookies.md`);
  `tempFileRetention()` is the read-side clamp.
- Keep the three seams Redis-free: `listTempFileReferences` (injectable listers), `classifyTempFile` (pure),
  `sweepTempDirectory` (`t.TempDir()` + `os.Chtimes`).

`withMissingQueueConfigurations` fills queue configurations an older install never stored, and `UpdateSystemSettings`
inserts a submitted configuration that has no row; without both, `UpsertSystemSettingsCommand.Validate` (one per queue)
400s every settings save.

## Endpoints

`GET /systemTask/{id}/sourceFile` (`{name, encodedImage}`) and `GET /systemTask/{id}/sourceFile/download` (original
bytes), gated on `group.activities.read` for the task row's own `GroupId`.

- Preview goes through `FileRepository.BuildDisplayImageString`, the one bytes-to-browser-image transform (PDF
  rasterized, HEIC transcoded). `BuildEncodedImageString` alone relabels PDF bytes as `image/jpeg` and the browser shows
  a broken image with no error anywhere. Download serves the original under its original name.
- The path comes from a Redis payload, so `FileRepository.AssertWithinTempDirectory` runs before anything opens it;
  `resolveActivityFlags` uses the same rule (`sourcePathUsable`) so flag and endpoint agree and the stat is no existence
  oracle.
- Read with `os.ReadFile`, never `utils.ReadFile` (which returns `(nil, nil)` on error).
- `Content-Disposition` is sanitized and built with `mime.FormatMediaType` (quotes escaped, RFC 5987 for non-ASCII);
  `desktop/src/utils/file.ts` parses both forms. Copy `DownloadReceiptImage`'s streaming shape (`ResponseType: ""`,
  header first, `return 0, nil`), not its unquoted header.

## Flags

- `hasSourceFile`: the task type expects an upload, it exists, and the task has not succeeded (`offersSourceFile`, shared
  with `ResolveSystemTaskSourceFile`). Any other state, so a user need not wait minutes for the task to archive.
- `canBeRestarted`: the task is `Archived` and every file a rerun reads exists. `Inspector.RunTask` does not refuse by
  state (it re-queues even a completed task), so `rerunnableState` / `CanRerunTask` enforce it and `RerunActivity`
  answers 400 otherwise.

## Authorization order

Load the task row → gate on its `GroupId` → actor visibility (`enforceActivityActorVisible`, through
`PermissionService.UserVisibleInGroup`; a nil `RanByUserId` is a system action and stays visible) → only then resolve the
file and answer 400/404. `models.SystemTask` carries `GroupId` and `RanByUserId`, so no Redis is needed for the gate, and a
nil `GroupId` fails closed. An unknown id maps to the same 403 (`loadSystemTaskForSourceFile`), and `RerunActivity`'s
type check runs after the gate. `activityAccessDeniedMessage` **is** `unauthorizedEntityMessage`, so every denial body
matches; assert a fix across every denial pairing.

## Hydration traps

- `GetPagedActivities` must `Omit("can_be_restarted", "has_source_file")` (GORM infers the SELECT from the destination).
- The hydrators live in `wranglerasynq` (it imports `repositories`; the reverse is a cycle).
- On the admin system-task table the flags are resolved per caller through a `canReadGroup` predicate.
- Nothing here fails a request: an aged-out task or unreadable payload leaves both flags false.
