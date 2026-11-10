package repositories

import (
	config "cartvibe/api/internal/env"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

// Snapshots are whole, consistent copies of the database, written by SQLite itself (VACUUM INTO) while the app
// runs. They exist because the live database is three files that only match each other at one instant
// (app.db, -wal, -shm): a backup tool that copies the folder while the app writes can catch them out of step,
// and stopping the stack first is a step people skip. A snapshot is one self-contained file that can be copied at
// any time, and one is taken by itself:
//   - before the schema is migrated, whenever a different version of the app starts on existing data
//     (SnapshotBeforeUpgrade), so a release that goes wrong has a copy from the moment before it;
//   - once a day (SnapshotDatabase, the DatabaseSnapshot clean-up task).
//
// They live in sqlite/backups, inside the sqlite volume, so they are on the NAS and in its backup. They hold the
// database only; the receipt files are in the data volume, which never has this problem (a file is written once).
const (
	snapshotDirName = "backups"

	snapshotKindUpgrade = "upgrade"
	snapshotKindDaily   = "daily"

	// How many of each kind are kept; the oldest go first.
	keepUpgradeSnapshots = 5
	keepDailySnapshots   = 7

	// bootedVersionFile names the version that last started on this database.
	bootedVersionFile = "last-version"
)

func snapshotDirectory() string {
	return filepath.Join("sqlite", snapshotDirName)
}

// snapshotBaseName is the database file's name without its extension ("app" for app.db).
func snapshotBaseName() string {
	dbConfig, _ := config.GetDatabaseConfig()
	base := filepath.Base(dbConfig.Filename)
	base = strings.TrimSuffix(base, filepath.Ext(base))
	if base == "" || base == "." || base == string(filepath.Separator) {
		return "app"
	}

	return base
}

// SnapshotBeforeUpgrade copies the database when version differs from the one that last started on it. It returns
// the snapshot's path, or "" when none was due: a development build (no version), a fresh install (nothing to
// lose yet) or the same version starting again. Call it after Connect and before MakeMigrations.
func SnapshotBeforeUpgrade(version string) (string, error) {
	return snapshotBeforeUpgrade(db, snapshotDirectory(), snapshotBaseName(), version, time.Now())
}

func snapshotBeforeUpgrade(target *gorm.DB, dir string, base string, version string, now time.Time) (string, error) {
	if version == "" || readBootedVersion(dir) == version {
		return "", nil
	}

	// A database with no users table has never been migrated: a fresh install.
	if !target.Migrator().HasTable("users") {
		return "", nil
	}

	path, err := writeSnapshot(target, dir, base, snapshotKindUpgrade, now)
	if err != nil {
		return "", err
	}
	pruneSnapshots(dir, base, snapshotKindUpgrade, keepUpgradeSnapshots)

	return path, nil
}

// MarkVersionBooted records that version started on this database, so the next start of the same version takes no
// upgrade snapshot. Call it once the migrations have run.
func MarkVersionBooted(version string) error {
	return markVersionBooted(snapshotDirectory(), version)
}

func markVersionBooted(dir string, version string) error {
	if version == "" {
		return nil
	}
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}

	return os.WriteFile(filepath.Join(dir, bootedVersionFile), []byte(version+"\n"), 0o640)
}

func readBootedVersion(dir string) string {
	content, err := os.ReadFile(filepath.Join(dir, bootedVersionFile))
	if err != nil {
		return ""
	}

	return strings.TrimSpace(string(content))
}

// SnapshotDatabase writes the daily snapshot and removes the ones past their keep.
func SnapshotDatabase(now time.Time) (string, error) {
	if db == nil {
		return "", errors.New("the database is not connected")
	}

	dir, base := snapshotDirectory(), snapshotBaseName()
	path, err := writeSnapshot(db, dir, base, snapshotKindDaily, now)
	if err != nil {
		return "", err
	}
	pruneSnapshots(dir, base, snapshotKindDaily, keepDailySnapshots)

	return path, nil
}

// DailySnapshotDue reports whether a daily snapshot should be written now: there is none yet, or the newest one
// is a day old, going by the time in its name. The hourly task asks this instead of counting from the process's
// start, so a server that restarts every night still gets its copy once a day, and one that restarts ten times
// in an hour does not write ten.
func DailySnapshotDue(now time.Time) bool {
	return dailySnapshotDue(snapshotDirectory(), snapshotBaseName(), now)
}

func dailySnapshotDue(dir string, base string, now time.Time) bool {
	prefix := fmt.Sprintf("%s-%s-", base, snapshotKindDaily)
	paths, err := filepath.Glob(filepath.Join(dir, prefix+"*.db"))
	if err != nil || len(paths) == 0 {
		return true
	}

	sort.Strings(paths)
	name := strings.TrimSuffix(strings.TrimPrefix(filepath.Base(paths[len(paths)-1]), prefix), ".db")
	newest, err := time.Parse("20060102-150405", name)
	if err != nil {
		return true
	}

	return now.UTC().Sub(newest) >= 24*time.Hour
}

// writeSnapshot writes dir/<base>-<kind>-<UTC time>.db. VACUUM INTO reads inside one transaction, so the copy is
// consistent whatever is being written meanwhile, and the result carries no -wal file. It refuses an existing
// target, so a leftover of the same second is removed first.
func writeSnapshot(target *gorm.DB, dir string, base string, kind string, now time.Time) (string, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return "", fmt.Errorf("database snapshot: %w", err)
	}

	path := filepath.Join(dir, fmt.Sprintf("%s-%s-%s.db", base, kind, now.UTC().Format("20060102-150405")))
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", fmt.Errorf("database snapshot: %w", err)
	}

	if err := target.Exec("VACUUM INTO ?", path).Error; err != nil {
		os.Remove(path)
		return "", fmt.Errorf("database snapshot: %w", err)
	}

	return path, nil
}

// pruneSnapshots keeps the newest keep snapshots of one kind. The time in the name sorts as text.
func pruneSnapshots(dir string, base string, kind string, keep int) {
	paths, err := filepath.Glob(filepath.Join(dir, fmt.Sprintf("%s-%s-*.db", base, kind)))
	if err != nil || len(paths) <= keep {
		return
	}

	sort.Strings(paths)
	for _, path := range paths[:len(paths)-keep] {
		os.Remove(path)
	}
}
