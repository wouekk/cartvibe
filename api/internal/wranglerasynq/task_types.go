package wranglerasynq

const (
	QuickScan           = "receipt:quick_scan"
	TempFileCleanUp     = "system_clean_up:temp_files"
	RefreshTokenCleanUp = "system_clean_up:refresh_token"
	OidcSessionCleanUp  = "system_clean_up:oidc"
	// ReceiptProductSweep reads the products of receipts that are due (see
	// services.ReceiptProductExtractionService). It rides the system clean-up
	// queue as a periodic sweep: a new queue name would be a new value in the
	// closed QueueName enum released clients deserialize.
	ReceiptProductSweep = "system_clean_up:receipt_products"
	// FoodClassificationSweep tags receipt products and shopping list items with health and
	// seasonality (see services.FoodClassificationService). Same queue, same reason.
	FoodClassificationSweep = "system_clean_up:food_classification"
	// ShoppingTripSweep scans photos uploaded from shopping lists and compares receipts with their
	// lists (see services.ShoppingTripService). Same queue, same reason.
	ShoppingTripSweep = "system_clean_up:shopping_trips"
	// ShopLogoSync downloads the missing logos of the brands on the household's receipts with its Logo.dev key
	// (see services.SyncShopLogos). Same queue, same reason.
	ShopLogoSync = "system_clean_up:shop_logos"
)
