package jobs

// The names of the background work: the two kinds of job the queue runs (queue.go) and the periodic tasks
// (periodic.go). A job's name is stored on its row, so it must not change; the others only appear in the log.
const (
	QuickScan           = "receipt:quick_scan"
	TempFileCleanUp     = "system_clean_up:temp_files"
	RefreshTokenCleanUp = "system_clean_up:refresh_token"
	OidcSessionCleanUp  = "system_clean_up:oidc"
	// ReceiptProductSweep reads the products of receipts that are due (see
	// services.ReceiptProductExtractionService).
	ReceiptProductSweep = "system_clean_up:receipt_products"
	// FoodClassificationSweep tags receipt products and shopping list items with health and
	// seasonality (see services.FoodClassificationService).
	FoodClassificationSweep = "system_clean_up:food_classification"
	// ShoppingTripSweep scans photos uploaded from shopping lists and compares receipts with their
	// lists (see services.ShoppingTripService).
	ShoppingTripSweep = "system_clean_up:shopping_trips"
	// ShopLogoSync downloads the missing logos of the brands on the household's receipts with its Logo.dev key
	// (see services.SyncShopLogos).
	ShopLogoSync = "system_clean_up:shop_logos"
	// WarrantyReminderSweep sends the warranty reminders whose day has come (see
	// services.FireDueWarrantyReminders).
	WarrantyReminderSweep = "system_clean_up:warranty_reminders"
	// BackupImport runs one household import an admin started (see backup.RunImportJob): a job, not a sweep.
	// Its payload names the import only.
	BackupImport = "system_clean_up:backup_import"
	// DatabaseSnapshot writes the daily copy of the database to sqlite/backups (see
	// repositories.SnapshotDatabase).
	DatabaseSnapshot = "system_clean_up:database_snapshot"
	// DatabaseMaintenance lets SQLite refresh its planner statistics and trims the WAL file (see
	// repositories.OptimizeDatabase).
	DatabaseMaintenance = "system_clean_up:database_maintenance"
)
