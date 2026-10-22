package models

import (
	"encoding/json"
	"github.com/shopspring/decimal"
	"time"
)

type Receipt struct {
	BaseModel
	Name string `gorm:"not null" json:"name"`
	// ShopName is the shop printed on the receipt (Auchan, Edeka, Rewe), read by the AI or typed by a
	// person. Distinct from Name, which people set freely. Empty when unknown.
	ShopName     string             `gorm:"type:varchar(200);not null;default:''" json:"shopName"`
	// OriginalAmount, OriginalCurrency and ExchangeRate record a receipt that was in another currency
	// than the main one: Amount is then the converted amount. ExchangeRate is the rate used (main units
	// per foreign unit); with a currency but no rate the receipt is unconverted and waits for a rate.
	OriginalAmount   *decimal.Decimal `gorm:"type:decimal(14,2)" json:"originalAmount"`
	OriginalCurrency string           `gorm:"type:varchar(3);not null;default:''" json:"originalCurrency"`
	ExchangeRate     *decimal.Decimal `gorm:"type:decimal(18,6)" json:"exchangeRate"`
	Amount       decimal.Decimal    `gorm:"type:decimal(10,2);not null" json:"amount"`
	Date         time.Time          `gorm:"not null" json:"date"`
	ResolvedDate *time.Time         `json:"resolvedDate"`
	PaidByUserID uint               `json:"paidByUserId"`
	PaidByUser   User               `json:"-"`
	Status       ReceiptStatus      `gorm:"default:'OPEN';not null" json:"status"`
	GroupId      uint               `gorm:"not null" json:"groupId"`
	Group        Group              `json:"-"`
	Categories   []Category         `gorm:"many2many:receipt_categories" json:"categories"`
	Tags         []Tag              `gorm:"many2many:receipt_tags" json:"tags"`
	ImageFiles   []FileData         `json:"imageFiles"`
	ReceiptItems []Item             `json:"receiptItems"`
	Comments     []Comment          `json:"comments"`
	// FirstComment is the text of the earliest comment the caller may see, a
	// transient projection filled only by the paged receipts list (see
	// PermissionService.LoadFirstVisibleComments). omitempty keeps it off every
	// other response, where it is never loaded.
	FirstComment *string `gorm:"-" json:"firstComment,omitempty"`
	// SearchMatches names the product lines that made the receipt match the list's search phrase,
	// filled only by the paged receipts list while a search is active.
	SearchMatches []ReceiptSearchMatch `gorm:"-" json:"searchMatches,omitempty"`
}

// ReceiptSearchMatch is one product line shown under a receipt to say why a search found it.
type ReceiptSearchMatch struct {
	Name   string           `json:"name"`
	Amount *decimal.Decimal `json:"amount"`
}

func (r *Receipt) ToString() (string, error) {
	bytes, err := json.Marshal(r)
	if err != nil {
		return "", err
	}

	return string(bytes), nil
}
