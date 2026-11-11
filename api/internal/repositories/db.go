package repositories

import (
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// db is the one database of the process. Every repository reads it through GetDB when it is built.
var db *gorm.DB

// setDB replaces the process database (Connect, and the tests that swap it).
func setDB(connectedDb *gorm.DB) {
	db = connectedDb
}

// sqliteFile is the database file as a DSN without its query, in the sqlite folder (made when missing).
func sqliteFile(dbConfig structs.DatabaseConfig) (string, error) {
	err := utils.DirectoryExists("./sqlite", true)
	if err != nil {
		return "", err
	}

	return fmt.Sprintf("file:./sqlite/%s", dbConfig.Filename), nil
}

// BuildSqliteConnectionString is the DSN of the writing connection; the readers add query_only to it
// (openSplitPool).
func BuildSqliteConnectionString(dbConfig structs.DatabaseConfig) (string, error) {
	file, err := sqliteFile(dbConfig)
	if err != nil {
		return "", err
	}

	return file + "?" + sqliteParams(true), nil
}

// sqliteParams is the DSN query every SQLite connection opens with. The driver runs each _pragma on
// every new pooled connection, which matters for the per-connection ones (busy_timeout, foreign_keys).
//   - WAL lets readers run while one writer commits, and Litestream needs it to replicate.
//   - busy_timeout makes a connection wait for a lock instead of failing with SQLITE_BUSY at once. The app's
//     own writers queue in Go (sqlite_pools.go), so this is for a lock held from outside: Litestream's
//     checkpoint, a copy tool, a second process.
//   - synchronous(NORMAL) is the safe level for WAL: a power cut can lose the last commits, never
//     corrupt the file.
//   - _txlock=immediate takes the write lock at BEGIN, so a transaction that read first never fails on
//     upgrading to a writer (which busy_timeout cannot retry in WAL).
//   - journal_size_limit caps the -wal file a checkpoint leaves behind (64 MB), so one large import does not
//     leave a file of that size beside the database for good.
//   - temp_store(MEMORY) keeps sorting and temporary indexes out of the container's temp folder.
//   - cache_size(-8000) gives each connection 8 MB of page cache instead of SQLite's 2 MB; a report over a
//     year of receipts reads the same pages many times.
func sqliteParams(foreignKeys bool) string {
	foreignKeysValue := 0
	if foreignKeys {
		foreignKeysValue = 1
	}

	return fmt.Sprintf(
		"_pragma=foreign_keys(%d)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(%d)&_pragma=synchronous(NORMAL)"+
			"&_pragma=journal_size_limit(%d)&_pragma=temp_store(MEMORY)&_pragma=cache_size(%d)&_txlock=immediate",
		foreignKeysValue,
		sqliteBusyTimeoutMs,
		sqliteJournalSizeLimitBytes,
		sqliteCacheSizeKib,
	)
}

// OptimizeDatabase is SQLite's own housekeeping, run once a day: `PRAGMA optimize` refreshes the statistics the
// query planner works from where a table changed a lot, and a truncating checkpoint folds the -wal file back into
// the database. The checkpoint is best effort: while something is reading it does what it can and says so.
func OptimizeDatabase() error {
	if db == nil {
		return errors.New("the database is not connected")
	}
	if err := db.Exec("PRAGMA optimize").Error; err != nil {
		return err
	}

	return checkpointWal(db)
}

// checkpointWal moves everything in the -wal file into the database file and empties it.
func checkpointWal(target *gorm.DB) error {
	var result struct {
		Busy         int
		Log          int
		Checkpointed int
	}

	return target.Raw("PRAGMA wal_checkpoint(TRUNCATE)").Scan(&result).Error
}

// CloseDB ends the process's use of the database: a last checkpoint, so the database file alone holds everything
// (a copy of app.db taken after a clean stop needs no -wal file beside it), then both pools are closed. main.go
// calls it once the HTTP server and the background work have stopped.
func CloseDB() error {
	if db == nil {
		return nil
	}

	checkpointErr := checkpointWal(db)

	if err := closePools(db); err != nil {
		return err
	}

	return checkpointErr
}

// closePools closes every connection behind a database opened by openSplitDatabase.
func closePools(connected *gorm.DB) error {
	if pool, ok := poolsOf(connected); ok {
		return pool.Close()
	}

	sqlDB, err := connected.DB()
	if err != nil {
		return err
	}

	return sqlDB.Close()
}

const (
	sqliteBusyTimeoutMs = 5000

	sqliteJournalSizeLimitBytes = 64 * 1024 * 1024

	// A negative cache_size is in KiB (a positive one would be pages).
	sqliteCacheSizeKib = -8000

	// sqliteReaderConns caps the reading pool; the writing pool is one connection (sqlite_pools.go).
	sqliteReaderConns = 8
)

// logJournalMode logs the journal mode the file is really in, so a volume that cannot hold WAL (a network
// share) shows up in the log instead of as lock errors later.
func logJournalMode(connectedDb *gorm.DB) error {
	var journalMode string
	if err := connectedDb.Raw("PRAGMA journal_mode").Scan(&journalMode).Error; err != nil {
		return err
	}
	logging.LogStd(logging.LOG_LEVEL_INFO, fmt.Sprintf("sqlite journal mode: %s", journalMode))

	return nil
}

// checkDatabaseEngine refuses every DB_ENGINE but sqlite, unset included: the app runs on SQLite only
// (the MySQL/MariaDB and PostgreSQL drivers were removed), and a server must not start on a guess.
func checkDatabaseEngine(engine string) error {
	if engine == "sqlite" {
		return nil
	}

	return fmt.Errorf(
		"DB_ENGINE is %q, but CartVibe runs on SQLite only: set DB_ENGINE=sqlite (MySQL, MariaDB and PostgreSQL are not supported)",
		engine,
	)
}

// Connect opens the SQLite file once. It is local, so a failure is a configuration problem, not a
// race, and surfaces at once.
func Connect() error {
	dbConfig, err := config.GetDatabaseConfig()
	if err != nil {
		return err
	}

	if err := checkDatabaseEngine(dbConfig.Engine); err != nil {
		return err
	}

	file, err := sqliteFile(dbConfig)
	if err != nil {
		return err
	}

	connectedDb, err := openSplitDatabase(file, sqliteParams(true), &gorm.Config{Logger: quietGormLogger()})
	if err != nil {
		return fmt.Errorf("failed to open the database: %w", err)
	}

	if err := logJournalMode(connectedDb); err != nil {
		return err
	}

	setDB(connectedDb)
	return nil
}

func MakeMigrations() error {
	return migrateSchema(db)
}

// migrateSchema creates or extends every table on target (MakeMigrations runs it on the process database).
func migrateSchema(target *gorm.DB) error {
	err := target.AutoMigrate(
		&models.RefreshToken{},
		&models.AppRole{},
		&models.AppRolePermission{},
		&models.User{},
		&models.Receipt{},
		&models.FileData{},
		&models.Tag{},
		&models.Category{},
		&models.Group{},
		&models.GroupRoleDefinition{},
		&models.GroupRolePermission{},
		&models.GroupMember{},
		&models.Notification{},
		&models.UserPreferences{},
		&models.DashboardLayout{},
		&models.SystemSettings{},
		&models.SystemTask{},
		&models.ReceiptProcessingSettings{},
		&models.ReportTemplate{},
		&models.ReportTemplateGroup{},
		&models.GroupReceiptSettings{},
		&models.DataMigration{},
		&models.OAuthClient{},
		&models.OAuthAuthorizationCode{},
		&models.OidcProvider{},
		&models.OidcIdentity{},
		&models.OidcAuthSession{},
		&models.OidcDeleteConfirmation{},
		&models.ShoppingList{},
		&models.ShoppingListItem{},
		&models.ShoppingTrip{},
		&models.ReceiptProduct{},
		&models.ReceiptProductExtraction{},
		&models.ExchangeRate{},
		&models.ProductClassificationOverride{},
		&models.WarrantyReminder{},
		&models.PushSubscription{},
		&models.BackupImportJob{},
		&models.Job{},
		&models.AiUsage{},
	)

	return err
}

func GetDB() *gorm.DB {
	return db
}

func InitDB() error {

	// The first settings row is the euro one. Anything that creates a row before this (an empty
	// row here used to) would leave a fresh install on dollars, because the seed only acts on an
	// empty table.
	if err := SeedEuroForNewInstall(); err != nil {
		return err
	}

	if err := SeedSystemRoles(); err != nil {
		return err
	}

	// Must run after the roles are seeded and before the bootstrap admin /
	// data migration so the default app and group roles exist for assignment.
	if err := EnsureDefaultRoles(); err != nil {
		return err
	}

	if config.GetDeployEnv() != "test" {
		userRepository := NewUserRepository(nil)
		err := userRepository.CreateUserIfNoneExist()
		if err != nil {
			return err
		}
	}

	if err := SeedDefaultExchangeRates(); err != nil {
		return err
	}

	if err := RunDataMigrations(); err != nil {
		return err
	}
	if err := SeedStarterReportTemplates(); err != nil {
		return err
	}

	return nil
}

// testDbFile is the database every package's test suite runs against.
const testDbFile = "file:test.db"

// InitTestDb opens the test database the way Connect opens the real one: one writing connection and a pool of
// readers, so a test that writes outside its transaction fails here as it would on the server.
func InitTestDb() {
	testDb, err := openSplitDatabase(testDbFile, sqliteParams(true), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	setDB(testDb)
}

// UseTestDbWithoutForeignKeysForTests points the package database at a second
// pair of pools on the same test database, opened with foreign key
// enforcement OFF, and returns a function restoring the original. Tests only.
// Calling restore more than once is harmless, so a test may both defer it and
// call it early.
//
// It lets a test tell an explicit delete apart from an ON DELETE CASCADE that
// would otherwise have done the work. SQLite's foreign_keys pragma is per
// connection and InitTestDb turns it on for every new one, so it cannot be
// switched off on those pools.
func UseTestDbWithoutForeignKeysForTests() (restore func(), err error) {
	withoutForeignKeys, err := openSplitDatabase(testDbFile, sqliteParams(false), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	previous := db
	setDB(withoutForeignKeys)

	return func() {
		setDB(previous)
		closePools(withoutForeignKeys)
	}, nil
}

// quietGormLogger is GORM's default logger without the "record not found" lines. The background
// sweeps ask for the next due row with First(), and an empty queue is the normal answer, not an error;
// logging each one filled the container log with a SELECT every few minutes. Real errors and slow
// queries are still logged.
func quietGormLogger() logger.Interface {
	return logger.New(log.New(os.Stdout, "\r\n", log.LstdFlags), logger.Config{
		SlowThreshold:             200 * time.Millisecond,
		LogLevel:                  logger.Warn,
		IgnoreRecordNotFoundError: true,
		Colorful:                  false,
	})
}
