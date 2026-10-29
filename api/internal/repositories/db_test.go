package repositories

import (
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"sync"
	"testing"

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
	db = previous

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
		var busyTimeout, foreignKeys int
		if err := conn.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil {
			t.Fatal(err)
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

func TestShouldCreateTheCorrectMariaDbString(t *testing.T) {
	defer teardownDbTests()

	dbConfig := structs.DatabaseConfig{
		User:     "root",
		Password: "password",
		Host:     "db",
		Port:     3306,
		Name:     "cartvibe",
	}

	connectionString := BuildMariaDbConnectionString(dbConfig)
	expected := "root:password@tcp(db:3306)/cartvibe?charset=utf8mb4&parseTime=True&loc=Local"

	if connectionString != expected {
		utils.PrintTestError(t, connectionString, expected)
	}
}

func TestShouldCreateTheCorrectPostgresqlString(t *testing.T) {
	defer teardownDbTests()

	dbConfig := structs.DatabaseConfig{
		User:     "root",
		Password: "password",
		Host:     "db",
		Port:     3306,
		Name:     "cartvibe",
	}

	connectionString := BuildPostgresqlConnectionString(dbConfig)
	expected := "host=db user=root password=password dbname=cartvibe port=3306 sslmode=disable"

	if connectionString != expected {
		utils.PrintTestError(t, connectionString, expected)
	}
}

func TestShouldCreateTheCorrectSqliteString(t *testing.T) {
	defer teardownDbTests()

	dbConfig := structs.DatabaseConfig{
		Filename: "test.db",
	}

	connectionString, _ := BuildSqliteConnectionString(dbConfig)
	expected := "file:./sqlite/test.db?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)&_txlock=immediate"

	if connectionString != expected {
		utils.PrintTestError(t, connectionString, expected)
	}
}
