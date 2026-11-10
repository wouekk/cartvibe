# Activity source files and the temp sweep

Purpose: how a failed quick scan's upload is kept, previewed, downloaded, rerun and finally removed, and the rules that keep each step safe.

## The temp directory and its sweep

`temp/` holds quick-scan uploads (one per file), short-lived scratch with its own `defer os.Remove`, and the `DebugOcr`
dumps (`services/ocr.go`), which nothing else removes. `HandleTempFileCleanUpTask`
(`jobs/temp_file_cleanup_handler.go`, every hour, `periodic.go`) is the only thing that reclaims them.

A quick scan is a row of `jobs` (`models.Job`) whose payload names its upload. The row is deleted when the scan
succeeds (the scan removes its own upload after the receipt commits) and stays as `FAILED` when it has used up its
tries, which is what the rules below read.

Classification, in order (the order is the behaviour):

| # | Case | Action |
|---|---|---|
| 1 | a job naming the file still waits or runs (`PENDING`, `RUNNING`, or a status this code does not know) | keep |
| 2 | else every job naming it is `FAILED` | keep until older than retention |
| 3 | no job names it | keep until aged, and only when the reference map is complete |

- `FAILED` is the rerunnable state and never means deletable at once.
- Age is the file's mtime (it doubles as the grace window between writing the file and storing the job).
- A missed job means deletion, so: a listing error aborts the sweep with zero deletions, and a job whose payload cannot
  be read clears `referencesComplete`, which stands down rule 3 only.
- After the files, the sweep deletes the `FAILED` jobs not touched for the retention window
  (`DeleteFailedOlderThan`): their upload has aged out with them, so there is nothing left to run again.
- `TempFileRetentionHours`: default 720, bounds 24-8760, `0` = unset, a pointer field (see `sessions-cookies.md`);
  `tempFileRetention()` is the read-side clamp.
- Keep the three seams free of the database: `listTempFileReferences` (an injectable lister), `classifyTempFile`
  (pure), `sweepTempDirectory` (`t.TempDir()` + `os.Chtimes`).

## Endpoints

`GET /systemTask/{id}/sourceFile` (`{name, encodedImage}`) and `GET /systemTask/{id}/sourceFile/download` (original
bytes), gated on `group.activities.read` for the task row's own `GroupId`.

- Preview goes through `FileRepository.BuildDisplayImageString`, the one bytes-to-browser-image transform (PDF
  rasterized, HEIC transcoded). `BuildEncodedImageString` alone relabels PDF bytes as `image/jpeg` and the browser shows
  a broken image with no error anywhere. Download serves the original under its original name.
- The path comes from the job's payload, stored at upload time, so `FileRepository.AssertWithinTempDirectory` runs before anything opens it;
  `resolveActivityFlags` uses the same rule (`sourcePathUsable`) so flag and endpoint agree and the stat is no existence
  oracle.
- Read with `os.ReadFile`, never `utils.ReadFile` (which returns `(nil, nil)` on error).
- `Content-Disposition` is sanitized and built with `mime.FormatMediaType` (quotes escaped, RFC 5987 for non-ASCII);
  `desktop/src/utils/file.ts` parses both forms. Copy `DownloadReceiptImage`'s streaming shape (`ResponseType: ""`,
  header first, `return 0, nil`), not its unquoted header.

## Flags

- `hasSourceFile`: the task's job still has a row (so the scan has not succeeded) and its upload is on disk, inside
  `temp/`. Any status, so a person need not wait for the last retry to get their image back.
- `canBeRestarted`: the job is `FAILED` and the file a rerun reads exists (`CanRerunJob`). `RerunActivity` checks
  the same, then takes the job with one conditional UPDATE (`JobRepository.Rerun`: back to `PENDING` with a fresh
  set of tries), so two presses queue it once; anything else answers 400.

## Authorization order

Load the task row → gate on its `GroupId` → actor visibility (`enforceActivityActorVisible`, through
`PermissionService.UserVisibleInGroup`; a nil `RanByUserId` is a system action and stays visible) → only then resolve the
file and answer 400/404. `models.SystemTask` carries `GroupId` and `RanByUserId`, so the job is not read before the gate, and a
nil `GroupId` fails closed. An unknown id maps to the same 403 (`loadSystemTaskForSourceFile`), and `RerunActivity`'s
type check runs after the gate. `activityAccessDeniedMessage` **is** `unauthorizedEntityMessage`, so every denial body
matches; assert a fix across every denial pairing.

## Hydration traps

- `GetPagedActivities` must `Omit("can_be_restarted", "has_source_file")` (GORM infers the SELECT from the destination).
- The hydrators live in `jobs` (it imports `repositories`; the reverse is a cycle).
- On the admin system-task table the flags are resolved per caller through a `canReadGroup` predicate.
- Nothing here fails a request: a job that is gone or an unreadable payload leaves both flags false.
