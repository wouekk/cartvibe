package repositories

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// connectSqliteForTest opens a real file database through Connect in a temp working directory, the
// way the server does, and puts the package test database back afterwards.
func connectSqliteForTest(t *testing.T) *gorm.DB {
	t.Helper()

	previous := db
	t.Chdir(t.TempDir())
	t.Setenv(string(constants.DbEngine), "sqlite")
	t.Setenv(string(constants.DbFileName), "app.db")

	if err := Connect(); err != nil {
		t.Fatalf("Connect failed: %v", err)
	}
	connected := db
	setDB(previous)

	t.Cleanup(func() {
		if sqlDB, err := connected.DB(); err == nil {
			sqlDB.Close()
		}
	})

	return connected
}

// The server's database must open in WAL (Litestream replicates the WAL; readers run while a writer
// commits), wait for locks, and enforce foreign keys on every pooled connection, not only the first.
func TestConnectSqliteAppliesPragmasOnEveryConnection(t *testing.T) {
	connected := connectSqliteForTest(t)

	sqlDB, err := connected.DB()
	if err != nil {
		t.Fatal(err)
	}
	if got := sqlDB.Stats().MaxOpenConnections; got != sqliteMaxOpenConns {
		t.Fatalf("expected the pool capped at %d, got %d", sqliteMaxOpenConns, got)
	}

	// Hold every connection of the pool at once, so each pragma is read on distinct connections.
	ctx := t.Context()
	for i := 0; i < sqliteMaxOpenConns; i++ {
		conn, err := sqlDB.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Close()

		var journalMode string
		var busyTimeout, foreignKeys, journalSizeLimit, tempStore, cacheSize int
		if err := conn.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
			t.Fatal(err)
		}
		for pragma, target := range map[string]*int{
			"journal_size_limit": &journalSizeLimit,
			"temp_store":         &tempStore,
			"cache_size":         &cacheSize,
		} {
			if err := conn.QueryRowContext(ctx, "PRAGMA "+pragma).Scan(target); err != nil {
				t.Fatal(err)
			}
		}
		// temp_store 2 is MEMORY.
		if journalSizeLimit != sqliteJournalSizeLimitBytes || tempStore != 2 || cacheSize != sqliteCacheSizeKib {
			t.Errorf("connection %d: journal_size_limit %d, temp_store %d, cache_size %d", i, journalSizeLimit, tempStore, cacheSize)
		}
		if err := conn.QueryRowContext(ctx, "PRAGMA busy_timeout").Scan(&busyTimeout); err != nil {
			t.Fatal(err)
		}
		if err := conn.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&foreignKeys); err != nil {
			t.Fatal(err)
		}

		if journalMode != "wal" {
			t.Errorf("connection %d: journal_mode %q, expected wal", i, journalMode)
		}
		if busyTimeout != sqliteBusyTimeoutMs {
			t.Errorf("connection %d: busy_timeout %d, expected %d", i, busyTimeout, sqliteBusyTimeoutMs)
		}
		if foreignKeys != 1 {
			t.Errorf("connection %d: foreign_keys off", i)
		}
	}
}

// A clean stop folds the -wal file into the database and closes the pool, so app.db alone is a whole copy.
func TestCloseDBCheckpointsAndCloses(t *testing.T) {
	connected := connectSqliteForTest(t)
	previous := db
	setDB(connected)
	defer setDB(previous)

	if err := connected.Exec("CREATE TABLE kept (value TEXT)").Error; err != nil {
		t.Fatal(err)
	}
	if err := connected.Exec("INSERT INTO kept (value) VALUES ('milk')").Error; err != nil {
		t.Fatal(err)
	}
	if err := OptimizeDatabase(); err != nil {
		t.Fatalf("the daily housekeeping failed: %v", err)
	}
	if err := connected.Exec("INSERT INTO kept (value) VALUES ('bread')").Error; err != nil {
		t.Fatal(err)
	}

	if err := CloseDB(); err != nil {
		t.Fatalf("CloseDB failed: %v", err)
	}

	if info, err := os.Stat(filepath.Join("sqlite", "app.db-wal")); err == nil && info.Size() != 0 {
		t.Errorf("expected an empty -wal file after a clean stop, got %d bytes", info.Size())
	}
	if err := connected.Exec("SELECT 1").Error; err == nil {
		t.Errorf("expected the pool to be closed")
	}

	// The file alone, with no -wal beside it, holds both rows.
	os.Remove(filepath.Join("sqlite", "app.db-wal"))
	os.Remove(filepath.Join("sqlite", "app.db-shm"))
	reopened, err := gorm.Open(sqlite.Open("file:./sqlite/app.db?"+sqliteParams(true)), &gorm.Config{})
	if err != nil {
		t.Fatal(err)
	}
	var count int64
	if err := reopened.Raw("SELECT COUNT(*) FROM kept").Scan(&count).Error; err != nil || count != 2 {
		t.Errorf("expected both rows in the database file, got %d, %v", count, err)
	}
	if sqlDB, err := reopened.DB(); err == nil {
		sqlDB.Close()
	}
}

// Many writers at once (quick-scan workers, sweeps, requests) must queue on the lock, not fail with
// SQLITE_BUSY, including transactions that read before they write.
func TestConnectSqliteConcurrentWritersAllSucceed(t *testing.T) {
	connected := connectSqliteForTest(t)

	if err := connected.Exec("CREATE TABLE counters (id INTEGER PRIMARY KEY, n INTEGER NOT NULL)").Error; err != nil {
		t.Fatal(err)
	}
	if err := connected.Exec("INSERT INTO counters (id, n) VALUES (1, 0)").Error; err != nil {
		t.Fatal(err)
	}

	const writers = 20
	var wg sync.WaitGroup
	errs := make(chan error, writers)
	for i := 0; i < writers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			errs <- connected.Transaction(func(tx *gorm.DB) error {
				var n int
				if err := tx.Raw("SELECT n FROM counters WHERE id = 1").Scan(&n).Error; err != nil {
					return err
				}
				return tx.Exec("UPDATE counters SET n = ? WHERE id = 1", n+1).Error
			})
		}()
	}
	wg.Wait()
	close(errs)

	for err := range errs {
		if err != nil {
			t.Fatalf("a concurrent writer failed: %v", err)
		}
	}

	var n int
	connected.Raw("SELECT n FROM counters WHERE id = 1").Scan(&n)
	if n != writers {
		t.Fatalf("expected %d increments, got %d (a read-then-write lost an update)", writers, n)
	}
}

func teardownDbTests() {
}

// foreignKeysPragma reads SQLite's foreign_keys pragma through the package
// database as it currently stands.
func foreignKeysPragma(t *testing.T) int {
	t.Helper()

	var enabled int
	if err := GetDB().Raw("PRAGMA foreign_keys").Scan(&enabled).Error; err != nil {
		t.Fatalf("failed to read the foreign_keys pragma: %v", err)
	}

	return enabled
}

// The hook must really switch enforcement off, or a cleanup test built on it
// passes on the cascade it exists to rule out, and its restore must put the
// enforcing pool back for every test after it.
func TestUseTestDbWithoutForeignKeysForTests(t *testing.T) {
	if foreignKeysPragma(t) != 1 {
		t.Fatalf("expected the test database to enforce foreign keys")
	}

	restore, err := UseTestDbWithoutForeignKeysForTests()
	if err != nil {
		t.Fatalf("UseTestDbWithoutForeignKeysForTests failed: %v", err)
	}
	// Deferred as well as called below: a t.Fatalf in between, including one
	// inside foreignKeysPragma, must not leave later tests on this handle.
	defer restore()

	if foreignKeysPragma(t) != 0 {
		t.Fatalf("expected foreign keys to be off while the hook is in effect")
	}

	restore()

	if foreignKeysPragma(t) != 1 {
		t.Fatalf("expected foreign keys to be enforced again after restore")
	}
}

// The app is SQLite-only: any other DB_ENGINE, or none, stops the boot with a message naming the fix
// instead of falling back to SQLite (which would start an empty database next to the intended one).
func TestConnectRefusesEveryEngineButSqlite(t *testing.T) {
	if err := checkDatabaseEngine("sqlite"); err != nil {
		t.Fatalf("sqlite must be accepted, got %v", err)
	}

	for _, engine := range []string{"", "mysql", "mariadb", "postgresql", "SQLITE", "sqlite3"} {
		t.Run(engine, func(t *testing.T) {
			previous := db
			t.Chdir(t.TempDir())
			t.Setenv(string(constants.DbEngine), engine)
			t.Setenv(string(constants.DbFileName), "app.db")

			err := Connect()
			if err == nil {
				t.Fatalf("Connect accepted DB_ENGINE=%q", engine)
			}
			if !strings.Contains(err.Error(), "DB_ENGINE=sqlite") {
				t.Fatalf("the error should name the fix, got %q", err.Error())
			}
			if db != previous {
				t.Fatalf("a refused engine must leave the database untouched")
			}
		})
	}
}

func TestShouldCreateTheCorrectSqliteString(t *testing.T) {
	defer teardownDbTests()

	dbConfig := structs.DatabaseConfig{
		Filename: "test.db",
	}

	connectionString, _ := BuildSqliteConnectionString(dbConfig)
	expected := "file:./sqlite/test.db?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)" +
		"&_pragma=journal_size_limit(67108864)&_pragma=temp_store(MEMORY)&_pragma=cache_size(-8000)&_txlock=immediate"

	if connectionString != expected {
		utils.PrintTestError(t, connectionString, expected)
	}
}
