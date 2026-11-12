package structs

import "time"

// The scan queue (GET /scanQueue) is what the AI has not read yet, in one answer: the quick scans the queue still
// holds, and the receipts that were saved without a read.

// Where a queued scan stands. Plain strings on the contract; new ones may follow.
const (
	// ScanWaiting has not been tried yet.
	ScanWaiting = "WAITING"
	// ScanReading is being read now.
	ScanReading = "READING"
	// ScanRetrying failed a try and waits for its next one (NextAttemptAt).
	ScanRetrying = "RETRYING"
	// ScanFailed used up its tries; it stays until it is run again or its upload ages out.
	ScanFailed = "FAILED"
)

// ScanQueue is the whole answer. Both lists are arrays, never null.
type ScanQueue struct {
	Scans          []ScanQueueScan    `json:"scans"`
	UnreadReceipts []ScanQueueReceipt `json:"unreadReceipts"`
	// UnreadReceiptCount is how many receipts wait for a read in all; UnreadReceipts holds the newest of them.
	UnreadReceiptCount int64 `json:"unreadReceiptCount"`
}

// ScanQueueScan is one quick scan the queue holds: a photo that is not a receipt yet.
type ScanQueueScan struct {
	Id               uint      `json:"id"`
	Status           string    `json:"status"`
	FileName         string    `json:"fileName"`
	GroupId          uint      `json:"groupId"`
	UploadedByUserId uint      `json:"uploadedByUserId"`
	UploadedAt       time.Time `json:"uploadedAt"`
	Attempts         int       `json:"attempts"`
	MaxAttempts      int       `json:"maxAttempts"`
	// NextAttemptAt is when a RETRYING scan is tried again; null otherwise.
	NextAttemptAt *time.Time `json:"nextAttemptAt"`
	LastError     string     `json:"lastError"`
	// HasFile and CanRerun are resolved for the caller, so a button never leads to a 403.
	HasFile  bool `json:"hasFile"`
	CanRerun bool `json:"canRerun"`
}

// ScanQueueReceipt is a receipt whose products the AI has not read (yet): it waits, the AI could not be reached,
// or the read was given up.
type ScanQueueReceipt struct {
	ReceiptId uint      `json:"receiptId"`
	Name      string    `json:"name"`
	GroupId   uint      `json:"groupId"`
	Date      time.Time `json:"date"`
	// Status is the extraction's own status (PENDING, RUNNING, UNAVAILABLE, FAILED), a plain string.
	Status    string    `json:"status"`
	Attempts  int       `json:"attempts"`
	LastError string    `json:"lastError"`
	UpdatedAt time.Time `json:"updatedAt"`
	// CanReadAgain is whether the caller may ask for another read of this receipt.
	CanReadAgain bool `json:"canReadAgain" gorm:"-"`
}

// ScanQueueSummary counts the quick scans of the households the caller sees.
type ScanQueueSummary struct {
	// Waiting is how many are waiting, being read or between tries.
	Waiting int `json:"waiting"`
	// Failed is how many used up their tries.
	Failed int `json:"failed"`
}
