package repositories

import (
	"bytes"
	"cartvibe/api/internal/logging"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

// SQLite has one writer at a time. With one pool for everything, two writers met inside SQLite: the second waited
// for the first's lock and failed with "database is locked" once busy_timeout (5 s) ran out, which is what a long
// import did to every other request that wanted to write.
//
// splitPool puts the queue in Go instead. It is two pools over the same file:
//
//   - the writer holds exactly one connection. Every transaction and every statement that is not a plain SELECT
//     goes through it, so writers wait their turn in database/sql and never meet a busy database;
//   - the readers (a SELECT outside a transaction) have their own connections, opened query_only, so a statement
//     that is routed here by mistake fails loudly instead of writing behind the writer's back. In WAL mode they
//     read while the writer writes.
//
// One connection for writing has one trap: code that, inside a transaction, writes through the process database
// instead of its tx waits for the connection its own transaction is holding. Two guards turn that from a hang
// into an error:
//
//   - the pool knows which goroutine holds a transaction, so a write by that goroutine outside its tx is refused
//     at once with ErrWriteOutsideTransaction (before the split it waited 5 s and failed with "database is
//     locked");
//   - any other wait for the writer ends after sqliteWriterWait with ErrWriterBusy, which covers a write made by
//     a goroutine the transaction's own code started and is waiting for.
//
// A read made outside the tx goes to a reader and, as before, does not see what the transaction has not committed.

// ErrWriteOutsideTransaction is returned for a write made on the process database by code that is running inside
// a transaction: the write has to go through the transaction (pass the tx to the repository or service).
var ErrWriteOutsideTransaction = errors.New(
	"database write outside the transaction this code is running in: write through the transaction (tx) instead",
)

// ErrWriterBusy is returned when the one writing connection did not come free in sqliteWriterWait: a transaction
// ran that long, or a write is waiting for a transaction that is itself waiting for the write.
var ErrWriterBusy = errors.New("the database was busy writing for too long")

// sqliteWriterWait is how long a write waits for the writer before it gives up. Until the split the limit was
// busy_timeout (5 s); a request that has waited this long has usually been given up on by its caller already.
const sqliteWriterWait = 30 * time.Second

type splitPool struct {
	writer *sql.DB
	reader *sql.DB

	// writerWait is sqliteWriterWait; tests shorten it.
	writerWait time.Duration

	mutex sync.Mutex
	// transactions counts the open transactions per goroutine id.
	transactions map[uint64]int
}

// openSplitPool opens the two pools over one SQLite file. params is sqliteParams' query string.
func openSplitPool(file string, params string) (*splitPool, error) {
	writer, err := sql.Open(sqlite.DriverName, file+"?"+params)
	if err != nil {
		return nil, err
	}
	writer.SetMaxOpenConns(1)
	writer.SetMaxIdleConns(1)

	// query_only: a reader can never change the database, whatever statement reaches it.
	reader, err := sql.Open(sqlite.DriverName, file+"?"+params+"&_pragma=query_only(1)")
	if err != nil {
		writer.Close()
		return nil, err
	}
	reader.SetMaxOpenConns(sqliteReaderConns)
	reader.SetMaxIdleConns(sqliteReaderConns)
	reader.SetConnMaxIdleTime(5 * time.Minute)

	pool := &splitPool{writer: writer, reader: reader, writerWait: sqliteWriterWait, transactions: map[uint64]int{}}

	// The writer first: on a new file it is the one that may create it and switch it to WAL.
	if err := writer.Ping(); err != nil {
		pool.Close()
		return nil, err
	}
	if err := reader.Ping(); err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}

// isReadOnlyStatement reports whether a statement only reads, going by its first word. Only a plain SELECT counts:
// a PRAGMA may change a setting or run a checkpoint, a WITH may lead into an INSERT, and anything unknown is safer
// on the writer (a reader would refuse it).
func isReadOnlyStatement(query string) bool {
	trimmed := strings.TrimLeft(query, " \t\r\n(")
	if len(trimmed) < 6 || !strings.EqualFold(trimmed[:6], "SELECT") {
		return false
	}

	return len(trimmed) == 6 || !isWordCharacter(trimmed[6])
}

func isWordCharacter(character byte) bool {
	return character == '_' || (character >= '0' && character <= '9') ||
		(character >= 'a' && character <= 'z') || (character >= 'A' && character <= 'Z')
}

// goroutineId reads the running goroutine's number from its stack header ("goroutine 42 [running]:"). Go offers no
// call for it on purpose; here it only decides whether a write would wait for its own transaction, and an id that
// cannot be read (0) simply never matches.
func goroutineId() uint64 {
	buffer := make([]byte, 64)
	buffer = buffer[:runtime.Stack(buffer, false)]
	buffer = bytes.TrimPrefix(buffer, []byte("goroutine "))
	end := bytes.IndexByte(buffer, ' ')
	if end < 0 {
		return 0
	}
	id, err := strconv.ParseUint(string(buffer[:end]), 10, 64)
	if err != nil {
		return 0
	}

	return id
}

func (pool *splitPool) holdsTransaction(id uint64) bool {
	pool.mutex.Lock()
	defer pool.mutex.Unlock()

	return id != 0 && pool.transactions[id] > 0
}

func (pool *splitPool) transactionOpened(id uint64) {
	pool.mutex.Lock()
	defer pool.mutex.Unlock()

	pool.transactions[id]++
}

func (pool *splitPool) transactionClosed(id uint64) {
	pool.mutex.Lock()
	defer pool.mutex.Unlock()

	if pool.transactions[id] <= 1 {
		delete(pool.transactions, id)
		return
	}
	pool.transactions[id]--
}

// awaitWriter waits until the writer is free, for writerWait at most. It takes the connection and gives it
// straight back: the statement that follows asks for it again, so this only bounds the wait behind a transaction
// that never ends; a wait behind ordinary work is short either way.
func (pool *splitPool) awaitWriter(ctx context.Context) error {
	if pool.holdsTransaction(goroutineId()) {
		return ErrWriteOutsideTransaction
	}

	waiting, cancel := context.WithTimeout(ctx, pool.writerWait)
	defer cancel()

	connection, err := pool.writer.Conn(waiting)
	if err != nil {
		if ctx.Err() == nil && errors.Is(err, context.DeadlineExceeded) {
			return fmt.Errorf("%w (%s)", ErrWriterBusy, pool.writerWait)
		}
		return err
	}

	return connection.Close()
}

// poolFor picks the pool for a statement made outside a transaction, waiting for the writer when it is a write.
func (pool *splitPool) poolFor(ctx context.Context, query string) (*sql.DB, error) {
	if isReadOnlyStatement(query) {
		return pool.reader, nil
	}
	if err := pool.awaitWriter(ctx); err != nil {
		return nil, err
	}

	return pool.writer, nil
}

func (pool *splitPool) PrepareContext(ctx context.Context, query string) (*sql.Stmt, error) {
	target, err := pool.poolFor(ctx, query)
	if err != nil {
		return nil, err
	}

	return target.PrepareContext(ctx, query)
}

func (pool *splitPool) ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	target, err := pool.poolFor(ctx, query)
	if err != nil {
		return nil, err
	}

	return target.ExecContext(ctx, query, args...)
}

func (pool *splitPool) QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error) {
	target, err := pool.poolFor(ctx, query)
	if err != nil {
		return nil, err
	}

	return target.QueryContext(ctx, query, args...)
}

// QueryRowContext cannot return an error of its own, so a refused write is asked of a cancelled context: the row
// then says "context canceled" and the reason is in the log. GORM uses QueryContext for everything it builds;
// this path is for a hand-written Row().
func (pool *splitPool) QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row {
	target, err := pool.poolFor(ctx, query)
	if err != nil {
		logging.LogStd(logging.LOG_LEVEL_ERROR, fmt.Sprintf("sqlite: %s", err.Error()))
		refused, cancel := context.WithCancel(ctx)
		cancel()
		return pool.reader.QueryRowContext(refused, query, args...)
	}

	return target.QueryRowContext(ctx, query, args...)
}

// BeginTx starts a transaction on the writer. A goroutine that already holds one and begins another on the process
// database (instead of nesting through its tx, which GORM turns into a savepoint) would wait for itself too.
func (pool *splitPool) BeginTx(ctx context.Context, opts *sql.TxOptions) (gorm.ConnPool, error) {
	if err := pool.awaitWriter(ctx); err != nil {
		return nil, err
	}

	tx, err := pool.writer.BeginTx(ctx, opts)
	if err != nil {
		return nil, err
	}
	id := goroutineId()
	pool.transactionOpened(id)

	return &heldTransaction{Tx: tx, pool: pool, goroutine: id}, nil
}

// GetDBConn is what gorm.DB.DB() hands out: the writer, which is where a caller's own statements belong.
func (pool *splitPool) GetDBConn() (*sql.DB, error) {
	return pool.writer, nil
}

// Ping is what gorm.Open checks a new database with.
func (pool *splitPool) Ping() error {
	return errors.Join(pool.writer.Ping(), pool.reader.Ping())
}

// Close closes both pools.
func (pool *splitPool) Close() error {
	return errors.Join(pool.reader.Close(), pool.writer.Close())
}

// heldTransaction is a transaction on the writer that tells the pool when it ends.
type heldTransaction struct {
	*sql.Tx
	pool      *splitPool
	goroutine uint64
	once      sync.Once
}

func (tx *heldTransaction) Commit() error {
	err := tx.Tx.Commit()
	tx.once.Do(func() { tx.pool.transactionClosed(tx.goroutine) })

	return err
}

func (tx *heldTransaction) Rollback() error {
	err := tx.Tx.Rollback()
	tx.once.Do(func() { tx.pool.transactionClosed(tx.goroutine) })

	return err
}

// GetDBConn keeps gorm.DB.DB() working on a transaction.
func (tx *heldTransaction) GetDBConn() (*sql.DB, error) {
	return tx.pool.writer, nil
}

// openSplitDatabase opens file through the split pools as a GORM database.
func openSplitDatabase(file string, params string, config *gorm.Config) (*gorm.DB, error) {
	pool, err := openSplitPool(file, params)
	if err != nil {
		return nil, err
	}

	connected, err := gorm.Open(sqlite.Dialector{Conn: pool}, config)
	if err != nil {
		pool.Close()
		return nil, err
	}

	// Every database the app or a test opens refuses an update that would write money wrongly (money_columns.go).
	if err := registerMoneyWriteGuard(connected); err != nil {
		pool.Close()
		return nil, err
	}

	return connected, nil
}

// poolsOf returns the split pools behind a database opened by openSplitDatabase.
func poolsOf(connected *gorm.DB) (*splitPool, bool) {
	pool, ok := connected.ConnPool.(*splitPool)

	return pool, ok
}
