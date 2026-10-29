package repositories

import (
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
	"gorm.io/driver/mysql"
	"gorm.io/driver/postgres"

	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var db *gorm.DB

func BuildMariaDbConnectionString(dbConfig structs.DatabaseConfig) string {
	host := fmt.Sprintf("%s:%d", dbConfig.Host, dbConfig.Port)
	connectionString := fmt.Sprintf("%s:%s@tcp(%s)/%s?charset=utf8mb4&parseTime=True&loc=Local", dbConfig.User, dbConfig.Password, host, dbConfig.Name)
	return connectionString
}

func BuildPostgresqlConnectionString(dbConfig structs.DatabaseConfig) string {
	connectionString := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable", dbConfig.Host, dbConfig.User, dbConfig.Password, dbConfig.Name, fmt.Sprint(dbConfig.Port))
	return connectionString
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

const (
	// dbConnectMaxAttempts and dbConnectRetryDelay control how long Connect waits
	// for the database to become reachable before giving up. This lets the API
	// survive the database not being ready yet at startup (e.g. when containers are
	// brought up by Docker restart policies or an orchestrator that does not
	// guarantee start order), instead of exiting fatally on the first connection
	// error and leaving the container in a broken state.
	dbConnectMaxAttempts = 10
	dbConnectRetryDelay  = 3 * time.Second
)

func Connect() error {
	dbConfig, err := config.GetDatabaseConfig()
	if err != nil {
		return err
	}

	dbEngine := dbConfig.Engine

	var dialector gorm.Dialector

	// Network-backed engines can be transiently unreachable at startup, so they
	// get connection retries. Sqlite is file-based — failures there are
	// configuration problems, not races, and should surface immediately.
	maxAttempts := dbConnectMaxAttempts

	switch dbEngine {
	case "mariadb", "mysql":
		dialector = mysql.Open(BuildMariaDbConnectionString(dbConfig))
	case "postgresql":
		dialector = postgres.Open(BuildPostgresqlConnectionString(dbConfig))
	case "sqlite":
		connectionString, sqliteErr := BuildSqliteConnectionString(dbConfig)
		if sqliteErr != nil {
			return sqliteErr
		}
		dialector = sqlite.Open(connectionString)
		maxAttempts = 1
	default:
		return fmt.Errorf("database engine of: %s! check your config to make sure it is correct", dbEngine)
	}

	connectedDb, err := openWithRetry(dialector, maxAttempts)
	if err != nil {
		return err
	}

	if dbEngine == "sqlite" {
		if err := configureSqlitePool(connectedDb); err != nil {
			return err
		}
	}

	db = connectedDb
	return nil
}

// openWithRetry opens the database connection, retrying transient failures so the
// API does not exit fatally when the database is briefly unreachable at startup.
func openWithRetry(dialector gorm.Dialector, maxAttempts int) (*gorm.DB, error) {
	var lastErr error

	for attempt := 1; attempt <= maxAttempts; attempt++ {
		connectedDb, err := gorm.Open(dialector, &gorm.Config{Logger: quietGormLogger()})
		if err == nil {
			return connectedDb, nil
		}

		lastErr = err
		if attempt < maxAttempts {
			logging.LogStd(
				logging.LOG_LEVEL_INFO,
				fmt.Sprintf(
					"database not ready (attempt %d/%d): %s; retrying in %s",
					attempt, maxAttempts, err.Error(), dbConnectRetryDelay,
				),
			)
			time.Sleep(dbConnectRetryDelay)
		}
	}

	return nil, fmt.Errorf("failed to connect to the database after %d attempts: %w", maxAttempts, lastErr)
}

func MakeMigrations() error {
	err := db.AutoMigrate(
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
		&models.Pepper{},
		&models.ApiKey{},
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

func InitTestDb() {
	sqlite, err := gorm.Open(sqlite.Open(testDbFile+"?"+sqliteParams(true)), &gorm.Config{})
	if err != nil {
		panic(err)
	}

	db = sqlite
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
	db = withoutForeignKeys

	return func() {
		db = previous

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
