package repositories

import (
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestIsReadOnlyStatement(t *testing.T) {
	for query, expected := range map[string]bool{
		"SELECT * FROM receipts":      true,
		"select sqlite_version()":     true,
		"\n\t  SELECT 1":              true,
		"(SELECT 1) UNION (SELECT 2)": true,
		"SELECT":                      true,
		"SELECTED":                    false,
		"":                            false,
		"INSERT INTO receipts (name) VALUES ('milk')":      false,
		"UPDATE receipts SET name = 'milk'":                false,
		"DELETE FROM receipts":                             false,
		"PRAGMA wal_checkpoint(TRUNCATE)":                  false,
		"PRAGMA foreign_keys":                              false,
		"VACUUM INTO 'copy.db'":                            false,
		"WITH due AS (SELECT 1) DELETE FROM receipts":      false,
		"INSERT INTO receipts (name) SELECT name FROM old": false,
		"CREATE TABLE kept (value TEXT)":                   false,
	} {
		if got := isReadOnlyStatement(query); got != expected {
			t.Errorf("isReadOnlyStatement(%q) = %v, expected %v", query, got, expected)
		}
	}
}

// splitDatabaseForTest is a real file database behind the split pools, with one table.
func splitDatabaseForTest(t *testing.T) (*gorm.DB, *splitPool) {
	t.Helper()

	connected := connectSqliteForTest(t)
	pool, ok := poolsOf(connected)
	if !ok {
		t.Fatalf("Connect must open the database through the split pools")
	}
	if err := connected.Exec("CREATE TABLE kept (value TEXT)").Error; err != nil {
		t.Fatal(err)
	}

	return connected, pool
}

func keptRows(t *testing.T, connected *gorm.DB) int64 {
	t.Helper()

	var count int64
	if err := connected.Raw("SELECT COUNT(*) FROM kept").Scan(&count).Error; err != nil {
		t.Fatal(err)
	}

	return count
}

// A reader can never write, whatever reaches it: a statement routed there by mistake fails instead of
// writing beside the queue of writers.
func TestSplitPoolReadersCannotWrite(t *testing.T) {
	_, pool := splitDatabaseForTest(t)

	if _, err := pool.reader.Exec("INSERT INTO kept (value) VALUES ('milk')"); err == nil {
		t.Fatalf("a reading connection accepted an INSERT")
	}
	if _, err := pool.writer.Exec("INSERT INTO kept (value) VALUES ('milk')"); err != nil {
		t.Fatalf("the writer refused an INSERT: %v", err)
	}
}

// A read outside a transaction does not wait for the writer: it runs while a transaction is open and sees
// the data as it was committed.
func TestSplitPoolReadsWhileATransactionIsOpen(t *testing.T) {
	connected, _ := splitDatabaseForTest(t)

	tx := connected.Begin()
	if tx.Error != nil {
		t.Fatal(tx.Error)
	}
	defer tx.Rollback()
	if err := tx.Exec("INSERT INTO kept (value) VALUES ('milk')").Error; err != nil {
		t.Fatal(err)
	}

	read := make(chan int64, 1)
	go func() {
		var count int64
		connected.Raw("SELECT COUNT(*) FROM kept").Scan(&count)
		read <- count
	}()

	select {
	case count := <-read:
		if count != 0 {
			t.Fatalf("a read outside the transaction saw %d uncommitted rows", count)
		}
	case <-time.After(3 * time.Second):
		t.Fatalf("a read waited for the open transaction")
	}

	// Inside the transaction the row is there.
	var inside int64
	if err := tx.Raw("SELECT COUNT(*) FROM kept").Scan(&inside).Error; err != nil || inside != 1 {
		t.Fatalf("the transaction should see its own row, got %d, %v", inside, err)
	}
	if err := tx.Commit().Error; err != nil {
		t.Fatal(err)
	}
	if count := keptRows(t, connected); count != 1 {
		t.Fatalf("expected the committed row, got %d", count)
	}
}

// The trap of one writing connection: code inside a transaction that writes through the process database
// would wait for itself. It is refused at once, by name, and the transaction is still usable.
func TestSplitPoolRefusesAWriteOutsideItsTransaction(t *testing.T) {
	connected, _ := splitDatabaseForTest(t)

	started := time.Now()
	err := connected.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("INSERT INTO kept (value) VALUES ('milk')").Error; err != nil {
			return err
		}

		if err := connected.Exec("INSERT INTO kept (value) VALUES ('bread')").Error; !errors.Is(err, ErrWriteOutsideTransaction) {
			t.Errorf("a write outside the tx: expected ErrWriteOutsideTransaction, got %v", err)
		}
		var returned []string
		if err := connected.Raw("INSERT INTO kept (value) VALUES ('eggs') RETURNING value").Scan(&returned).Error; !errors.Is(err, ErrWriteOutsideTransaction) {
			t.Errorf("a returning write outside the tx: expected ErrWriteOutsideTransaction, got %v", err)
		}
		if err := connected.Transaction(func(*gorm.DB) error { return nil }); !errors.Is(err, ErrWriteOutsideTransaction) {
			t.Errorf("a second transaction on the process database: expected ErrWriteOutsideTransaction, got %v", err)
		}
		// Nesting through the tx is a savepoint and works.
		return tx.Transaction(func(nested *gorm.DB) error {
			return nested.Exec("INSERT INTO kept (value) VALUES ('butter')").Error
		})
	})
	if err != nil {
		t.Fatalf("the transaction failed: %v", err)
	}
	if took := time.Since(started); took > 3*time.Second {
		t.Fatalf("the refusals took %s: they must not wait", took)
	}
	if count := keptRows(t, connected); count != 2 {
		t.Fatalf("expected the two rows written through the tx, got %d", count)
	}

	// Once the transaction is over the same goroutine writes freely, after a commit and after a rollback.
	if err := connected.Exec("INSERT INTO kept (value) VALUES ('tea')").Error; err != nil {
		t.Fatalf("a write after the commit failed: %v", err)
	}
	failed := errors.New("no")
	if err := connected.Transaction(func(*gorm.DB) error { return failed }); !errors.Is(err, failed) {
		t.Fatalf("expected the rollback's own error, got %v", err)
	}
	if err := connected.Exec("INSERT INTO kept (value) VALUES ('jam')").Error; err != nil {
		t.Fatalf("a write after the rollback failed: %v", err)
	}
}

// A write made by another goroutine while a transaction waits for it cannot be told apart from an honest
// wait, so it is bounded: it gives up with ErrWriterBusy instead of hanging the transaction for good.
func TestSplitPoolWriteBehindAStuckTransactionGivesUp(t *testing.T) {
	connected, pool := splitDatabaseForTest(t)
	pool.writerWait = 200 * time.Millisecond

	err := connected.Transaction(func(tx *gorm.DB) error {
		helper := make(chan error, 1)
		go func() { helper <- connected.Exec("INSERT INTO kept (value) VALUES ('milk')").Error }()

		select {
		case err := <-helper:
			if !errors.Is(err, ErrWriterBusy) {
				t.Errorf("expected ErrWriterBusy, got %v", err)
			}
		case <-time.After(5 * time.Second):
			t.Errorf("the write never gave up")
		}

		return nil
	})
	if err != nil {
		t.Fatalf("the transaction failed: %v", err)
	}
	if count := keptRows(t, connected); count != 0 {
		t.Fatalf("expected no rows, got %d", count)
	}
}

// Writers wait for each other in Go, longer than busy_timeout would have allowed inside SQLite.
func TestSplitPoolAWriterOutwaitsBusyTimeout(t *testing.T) {
	if testing.Short() {
		t.Skip("holds a transaction open for longer than busy_timeout")
	}
	connected, _ := splitDatabaseForTest(t)

	release := make(chan struct{})
	holding := make(chan struct{})
	held := make(chan error, 1)
	go func() {
		held <- connected.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec("INSERT INTO kept (value) VALUES ('milk')").Error; err != nil {
				return err
			}
			close(holding)
			<-release
			return nil
		})
	}()
	<-holding

	waited := make(chan error, 1)
	go func() { waited <- connected.Exec("INSERT INTO kept (value) VALUES ('bread')").Error }()

	time.Sleep(time.Duration(sqliteBusyTimeoutMs)*time.Millisecond + time.Second)
	select {
	case err := <-waited:
		t.Fatalf("the second writer did not wait for the first: %v", err)
	default:
	}
	close(release)

	if err := <-held; err != nil {
		t.Fatalf("the first writer failed: %v", err)
	}
	if err := <-waited; err != nil {
		t.Fatalf("the second writer failed after waiting: %v", err)
	}
	if count := keptRows(t, connected); count != 2 {
		t.Fatalf("expected both rows, got %d", count)
	}
}
