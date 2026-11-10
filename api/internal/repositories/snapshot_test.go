package repositories

import (
	"cartvibe/api/internal/models"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func snapshotFiles(t *testing.T, dir string, kind string) []string {
	t.Helper()

	paths, err := filepath.Glob(filepath.Join(dir, "app-"+kind+"-*.db"))
	if err != nil {
		t.Fatal(err)
	}

	return paths
}

// A snapshot is a database of its own: it opens without the live files beside it, passes SQLite's integrity check
// and holds the rows that were there when it was taken.
func TestWriteSnapshotIsAConsistentStandaloneCopy(t *testing.T) {
	defer TruncateTestDb()
	CreateTestUser()

	dir := t.TempDir()
	path, err := writeSnapshot(db, dir, "app", snapshotKindDaily, time.Date(2026, 11, 10, 3, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatalf("writeSnapshot failed: %v", err)
	}
	if filepath.Base(path) != "app-daily-20261110-030000.db" {
		t.Errorf("unexpected snapshot name %q", filepath.Base(path))
	}

	// Written after the snapshot: must not be in it.
	db.Create(&models.User{Username: "after-the-snapshot", DisplayName: "Later", Password: "x"})

	copyDb, err := gorm.Open(sqlite.Open("file:"+filepath.ToSlash(path)+"?mode=ro"), &gorm.Config{})
	if err != nil {
		t.Fatalf("the snapshot does not open: %v", err)
	}
	sqlDB, _ := copyDb.DB()
	defer sqlDB.Close()

	var integrity string
	if err := copyDb.Raw("PRAGMA integrity_check").Scan(&integrity).Error; err != nil || integrity != "ok" {
		t.Fatalf("integrity_check = %q, %v", integrity, err)
	}

	var liveCount, copyCount int64
	db.Model(&models.User{}).Count(&liveCount)
	copyDb.Model(&models.User{}).Count(&copyCount)
	if copyCount == 0 || copyCount != liveCount-1 {
		t.Errorf("the snapshot holds %d users, the live database %d (one added afterwards)", copyCount, liveCount)
	}

	if _, err := os.Stat(path + "-wal"); err == nil {
		t.Error("a snapshot must be a single file, without a -wal beside it")
	}
}

// The same second twice (a restart loop): the second snapshot replaces the first instead of failing.
func TestWriteSnapshotReplacesALeftoverOfTheSameSecond(t *testing.T) {
	defer TruncateTestDb()

	dir := t.TempDir()
	now := time.Date(2026, 11, 10, 3, 0, 0, 0, time.UTC)
	if _, err := writeSnapshot(db, dir, "app", snapshotKindDaily, now); err != nil {
		t.Fatal(err)
	}
	if _, err := writeSnapshot(db, dir, "app", snapshotKindDaily, now); err != nil {
		t.Fatalf("a second snapshot in the same second failed: %v", err)
	}
	if got := len(snapshotFiles(t, dir, snapshotKindDaily)); got != 1 {
		t.Errorf("expected one file, got %d", got)
	}
}

func TestPruneSnapshotsKeepsTheNewestOfItsKindOnly(t *testing.T) {
	dir := t.TempDir()
	for _, name := range []string{
		"app-daily-20261101-030000.db",
		"app-daily-20261102-030000.db",
		"app-daily-20261103-030000.db",
		"app-upgrade-20261001-120000.db",
		"other-daily-20260101-030000.db",
	} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("x"), 0o640); err != nil {
			t.Fatal(err)
		}
	}

	pruneSnapshots(dir, "app", snapshotKindDaily, 2)

	left := map[string]bool{}
	entries, _ := os.ReadDir(dir)
	for _, entry := range entries {
		left[entry.Name()] = true
	}
	if left["app-daily-20261101-030000.db"] {
		t.Error("the oldest daily snapshot should be gone")
	}
	for _, name := range []string{
		"app-daily-20261102-030000.db",
		"app-daily-20261103-030000.db",
		"app-upgrade-20261001-120000.db",
		"other-daily-20260101-030000.db",
	} {
		if !left[name] {
			t.Errorf("%s should have been kept", name)
		}
	}
}

// The upgrade snapshot is taken once per version change on a database that has data, and never otherwise.
func TestSnapshotBeforeUpgrade(t *testing.T) {
	defer TruncateTestDb()
	now := time.Date(2026, 11, 10, 8, 0, 0, 0, time.UTC)

	t.Run("a development build without a version takes none", func(t *testing.T) {
		dir := t.TempDir()
		path, err := snapshotBeforeUpgrade(db, dir, "app", "", now)
		if err != nil || path != "" || len(snapshotFiles(t, dir, snapshotKindUpgrade)) != 0 {
			t.Errorf("expected no snapshot, got %q, %v", path, err)
		}
	})

	t.Run("a fresh database takes none", func(t *testing.T) {
		dir := t.TempDir()
		empty, err := gorm.Open(sqlite.Open("file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "fresh.db"))), &gorm.Config{})
		if err != nil {
			t.Fatal(err)
		}
		sqlDB, _ := empty.DB()
		defer sqlDB.Close()

		path, err := snapshotBeforeUpgrade(empty, dir, "app", "sha-new", now)
		if err != nil || path != "" {
			t.Errorf("expected no snapshot of an empty database, got %q, %v", path, err)
		}
	})

	t.Run("a new version on existing data takes one, the same version again takes none", func(t *testing.T) {
		dir := t.TempDir()
		if err := markVersionBooted(dir, "sha-old"); err != nil {
			t.Fatal(err)
		}

		path, err := snapshotBeforeUpgrade(db, dir, "app", "sha-new", now)
		if err != nil || path == "" {
			t.Fatalf("expected a snapshot, got %q, %v", path, err)
		}
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("the snapshot file is missing: %v", err)
		}

		// The marker moves only once the migrations have run (MarkVersionBooted): a boot that died in between
		// takes its snapshot again.
		if got := readBootedVersion(dir); got != "sha-old" {
			t.Errorf("the booted version must not move before the migrations ran, got %q", got)
		}
		if err := markVersionBooted(dir, "sha-new"); err != nil {
			t.Fatal(err)
		}

		again, err := snapshotBeforeUpgrade(db, dir, "app", "sha-new", now.Add(time.Hour))
		if err != nil || again != "" {
			t.Errorf("the same version starting again must take no snapshot, got %q, %v", again, err)
		}
		if got := len(snapshotFiles(t, dir, snapshotKindUpgrade)); got != 1 {
			t.Errorf("expected one upgrade snapshot, got %d", got)
		}
	})

	t.Run("an install that never recorded a version is snapshotted on its first versioned start", func(t *testing.T) {
		dir := t.TempDir()
		path, err := snapshotBeforeUpgrade(db, dir, "app", "sha-first", now)
		if err != nil || path == "" {
			t.Errorf("expected a snapshot, got %q, %v", path, err)
		}
	})
}
