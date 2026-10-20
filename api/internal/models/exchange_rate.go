package models

import "github.com/shopspring/decimal"

// ExchangeRate is the household's own rate for one foreign currency (Phase 3 currencies): how many
// units of the main currency one unit of Code is worth, typed in by hand. A nil Rate means the currency
// is listed but no rate has been entered yet, so receipts in it are kept unconverted and flagged.
type ExchangeRate struct {
	BaseModel
	// Code is the ISO 4217 code, upper case ("CHF").
	Code string           `gorm:"type:varchar(3);not null;uniqueIndex" json:"code"`
	Rate *decimal.Decimal `gorm:"type:decimal(18,6)" json:"rate"`
}
