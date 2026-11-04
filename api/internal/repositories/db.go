package repositories

import (
	"cartvibe/api/internal/cell"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/glebarez/sqlite"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

// cells serves the cell handles. In standalone mode it holds today's single database; it always wraps
// the same *gorm.DB as db, because setDB is the only place either is assigned.
var cells cell.Manager

// setDB replaces the process database and the standalone manager that wraps it.
func setDB(connectedDb *gorm.DB) {
	db = connectedDb

	if connectedDb == nil {
		cells = nil
		return
	}

	// Only a nil database makes this fail, and that case returned above.
	cells, _ = cell.NewStandaloneManager(connectedDb)
}

// ImplicitCell returns the handle of the one standalone cell, the zero Handle before the database is
// connected (as GetDB returned nil then). It is the bridge for callers that do not receive a handle
// yet; once the HTTP layer resolves the cell per request it goes away.
func ImplicitCell() cell.Handle {
	if cells == nil {
		return cell.Handle{}
	}

	handle, err := cells.Implicit()
	if err != nil {
		return cell.Handle{}
	}

	return handle
}

func BuildSqliteConnectionString(dbConfig structs.DatabaseConfig) (string, error) {
	err := utils.DirectoryExists("./sqlite", true)
	if err != nil {
		return "", err
	}

	connectionString := fmt.Sprintf("file:./sqlite/%s?%s", dbConfig.Filename, sqliteParams(true))
	return connectionString, nil
}

// sqliteParams is the DSN query every SQLite connection opens with. The driver runs each _pragma on
// every new pooled connection, which matters for the per-connection ones (busy_timeout, foreign_keys).
//   - WAL lets readers run while one writer commits, and Litestream needs it to replicate.
//   - busy_timeout makes a writer wait for the lock instead of failing with SQLITE_BUSY at once; the
//     quick-scan workers, the sweeps and the API all write through one pool.
//   - synchronous(NORMAL) is the safe level for WAL: a power cut can lose the last commits, never
//     corrupt the file.
//   - _txlock=immediate takes the write lock at BEGIN, so a transaction that read first never fails on
//     upgrading to a writer (which busy_timeout cannot retry in WAL).
func sqliteParams(foreignKeys bool) string {
	foreignKeysValue := 0
	if foreignKeys {
		foreignKeysValue = 1
	}

	return fmt.Sprintf(
		"_pragma=foreign_keys(%d)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(%d)&_pragma=synchronous(NORMAL)&_txlock=immediate",
		foreignKeysValue,
		sqliteBusyTimeoutMs,
	)
}

const (
	sqliteBusyTimeoutMs = 5000

	// sqliteMaxOpenConns caps the pool. SQLite has one writer at a time whatever the pool size, so more
	// connections only add readers; more than one is still needed because some services open a second
	// connection inside a transaction (see UseTestDbWithoutForeignKeysForTests).
	sqliteMaxOpenConns = 8
)

// configureSqlitePool caps the connection pool and logs the journal mode the file is really in, so a
// volume that cannot hold WAL (a network share) shows up in the log instead of as lock errors later.
func configureSqlitePool(connectedDb *gorm.DB) error {
	sqlDB, err := connectedDb.DB()
	if err != nil {
		return err
	}

	sqlDB.SetMaxOpenConns(sqliteMaxOpenConns)
	sqlDB.SetMaxIdleConns(sqliteMaxOpenConns)
	sqlDB.SetConnMaxIdleTime(5 * time.Minute)

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

	connectionString, err := BuildSqliteConnectionString(dbConfig)
	if err != nil {
		return err
	}

	connectedDb, err := gorm.Open(sqlite.Open(connectionString), &gorm.Config{Logger: quietGormLogger()})
	if err != nil {
		return fmt.Errorf("failed to open the database: %w", err)
	}

	if err := configureSqlitePool(connectedDb); err != nil {
		return err
	}

	setDB(connectedDb)
	return nil
}

func MakeMigrations() error {
	return migrateSchema(db)
}

// migrateSchema creates or extends every table on target. MakeMigrations runs it on the process database;
// the twin-cell tests run it on each fixture cell.
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
		&models.GroupRoleCategoryGrant{},
		&models.GroupRoleTagGrant{},
		&models.GroupRolePaidByUserGrant{},
		&models.GroupMember{},
		&models.GroupMemberCategoryGrant{},
		&models.GroupMemberTagGrant{},
		&models.Comment{},
		&models.Notification{},
		&models.UserShortcut{},
		&models.UserPrefernces{},
		&models.DashboardLayout{},
		&models.TaskQueueConfiguration{},
		&models.SystemSettings{},
		&models.SystemTask{},
		&models.ReceiptProcessingSettings{},
		&models.ReportTemplate{},
		&models.ReportTemplateGroup{},
		&models.GroupRoleReportTemplateGrant{},
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
	)

	return err
}

func GetDB() *gorm.DB {
	return db
}

func InitDB() error {
	// Startup serves the one implicit cell until the cell is resolved by the caller.
	h := ImplicitCell()

	// The first settings row is the euro one. Anything that creates a row before this (an empty
	// row here used to) would leave a fresh install on dollars, because the seed only acts on an
	// empty table.
	if err := SeedEuroForNewInstall(h); err != nil {
		return err
	}

	if err := SeedSystemRoles(h); err != nil {
		return err
	}

	// Must run after the roles are seeded and before the bootstrap admin /
	// data migration so the default app and group roles exist for assignment.
	if err := EnsureDefaultRoles(h); err != nil {
		return err
	}

	if config.GetDeployEnv() != "test" {
		userRepository := NewUserRepository(h, nil)
		err := userRepository.CreateUserIfNoneExist()
		if err != nil {
			return err
		}
	}

	if err := SeedDefaultExchangeRates(h); err != nil {
		return err
	}

	if err := RunDataMigrations(h); err != nil {
		return err
	}
	if err := SeedStarterReportTemplates(h); err != nil {
		return err
	}

	return nil
}

// testDbFile is the database every package's test suite runs against.
const testDbFile = "file:test.db"

func InitTestDb() {
	sqlite, err := gorm.Open(sqlite.Open(testDbFile+"?"+sqliteParams(true)), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	setDB(sqlite)
}

// UseTestDbWithoutForeignKeysForTests points the package database at a second
// connection pool on the same test database, opened with foreign key
// enforcement OFF, and returns a function restoring the original. Tests only.
// Calling restore more than once is harmless, so a test may both defer it and
// call it early.
//
// It lets a test tell an explicit delete apart from an ON DELETE CASCADE that
// would otherwise have done the work. SQLite's foreign_keys pragma is per
// connection and InitTestDb turns it on for every new one, so it cannot be
// switched off on that pool; pinning the pool to a single connection instead
// deadlocks any code that opens a second one mid-transaction, which
// services.DeleteUser does.
func UseTestDbWithoutForeignKeysForTests() (restore func(), err error) {
	withoutForeignKeys, err := gorm.Open(sqlite.Open(testDbFile+"?"+sqliteParams(false)), &gorm.Config{})
	if err != nil {
		return nil, err
	}

	previous := db
	setDB(withoutForeignKeys)

	return func() {
		setDB(previous)

		if sqlDB, err := withoutForeignKeys.DB(); err == nil {
			sqlDB.Close()
		}
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
