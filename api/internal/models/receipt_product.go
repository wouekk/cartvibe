package models

import (
	"time"

	"github.com/shopspring/decimal"
)

// Column limits, matched by the extraction's truncation so a long AI answer can never fail the write.
const (
	MaxReceiptProductNameLength     = 200
	MaxReceiptProductQuantityLength = 50
)

// ReceiptProduct is one purchased product line read off a receipt by the AI ("LAIT DEMI-ECR 1L",
// €1.09). It is distinct from Item, which is a bill-splitting share. Products are always replaced as a
// whole set when a receipt is (re-)read.
type ReceiptProduct struct {
	BaseModel
	Receipt   Receipt `json:"-"`
	ReceiptId uint    `gorm:"not null;index:idx_receipt_product_receipt_id" json:"receiptId"`
	// Name is the line as printed; DisplayName a short plain name for it ("Semi-skimmed milk").
	Name        string `gorm:"type:varchar(200);not null" json:"name"`
	DisplayName string `gorm:"type:varchar(200);not null;default:''" json:"displayName"`
	// Amount is what the line cost, discounts applied; nil when the receipt does not show it.
	Amount   *decimal.Decimal `gorm:"type:decimal(10,2)" json:"amount"`
	Quantity string           `gorm:"type:varchar(50);not null;default:''" json:"quantity"`
	// Position is the line's order on the receipt.
	Position int `gorm:"not null;default:0" json:"position"`
	// Health and seasonality tags, filled in by the classification sweep after the products are read.
	FoodClassification `gorm:"embedded"`
}

// ReceiptProductExtractionStatus is where a receipt's product reading stands. A plain string on the
// API, never an enum: new states may follow.
type ReceiptProductExtractionStatus string

const (
	// Waiting for the next sweep.
	PRODUCT_EXTRACTION_PENDING ReceiptProductExtractionStatus = "PENDING"
	// Claimed by a sweep and being read now.
	PRODUCT_EXTRACTION_RUNNING ReceiptProductExtractionStatus = "RUNNING"
	PRODUCT_EXTRACTION_DONE    ReceiptProductExtractionStatus = "DONE"
	// The AI could not be reached (not configured, out of credits, down); retried later.
	PRODUCT_EXTRACTION_UNAVAILABLE ReceiptProductExtractionStatus = "UNAVAILABLE"
	// Gave up: the AI kept answering with something unreadable, or the retry window ran out.
	PRODUCT_EXTRACTION_FAILED ReceiptProductExtractionStatus = "FAILED"
)

// ReceiptProductExtraction tracks reading one receipt's products. A receipt has a row once it has an
// image (or someone asked for its products); the sweep works through the rows that are due.
type ReceiptProductExtraction struct {
	ReceiptId     uint                           `gorm:"primaryKey;autoIncrement:false" json:"receiptId"`
	Receipt       Receipt                        `json:"-"`
	Status        ReceiptProductExtractionStatus `gorm:"type:varchar(20);not null;index:idx_receipt_product_extraction_due,priority:1" json:"status"`
	NextAttemptAt time.Time                      `gorm:"not null;index:idx_receipt_product_extraction_due,priority:2" json:"nextAttemptAt"`
	// Attempts counts answers the AI gave that could not be read; outages do not count.
	Attempts  int       `gorm:"not null;default:0" json:"attempts"`
	LastError string    `gorm:"type:varchar(500);not null;default:''" json:"lastError"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
