package wranglerasynq

const (
	QuickScan    = "receipt:quick_scan"
	EmailPoll    = "email:poll"
	EmailProcess = "email:process"
	// EmailProcessImageCleanUp is the retired name for what is now TempFileCleanUp.
	// The task type is a string stored in Redis, so tasks the old cron already
	// enqueued outlive the upgrade; it stays declared, and routed in BuildMux, so
	// they still find a handler instead of failing as unregistered.
	EmailProcessImageCleanUp = "email:process_image_cleanup"
	TempFileCleanUp          = "system_clean_up:temp_files"
	RefreshTokenCleanUp      = "system_clean_up:refresh_token"
	OidcSessionCleanUp       = "system_clean_up:oidc"
	// ReceiptProductSweep reads the products of receipts that are due (see
	// services.ReceiptProductExtractionService). It rides the system clean-up
	// queue as a periodic sweep: a new queue name would be a new value in the
	// closed QueueName enum released clients deserialize.
	ReceiptProductSweep = "system_clean_up:receipt_products"
)
