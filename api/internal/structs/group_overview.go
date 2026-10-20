package structs

import "github.com/shopspring/decimal"

// GroupOverview is the landing page's month at a glance: the month's totals, its spending by
// category, and the six months ending with it. Amounts are decimals, strings on the wire.
type GroupOverview struct {
	// Month is the month described, "yyyy-MM".
	Month         string          `json:"month"`
	Total         decimal.Decimal `json:"total"`
	PreviousTotal decimal.Decimal `json:"previousTotal"`
	ReceiptCount  int64           `json:"receiptCount"`
	// OpenReceiptCount counts the month's receipts still to check (OPEN, NEEDS_ATTENTION or DRAFT).
	OpenReceiptCount int64 `json:"openReceiptCount"`
	// UnhealthyTotal is what the month's products rated unhealthy cost (Phase 2b tags), whatever the
	// receipt's category. Products without a price, or not rated yet, do not count.
	UnhealthyTotal decimal.Decimal         `json:"unhealthyTotal"`
	Categories     []GroupOverviewCategory `json:"categories"`
	// Months are the six months ending with Month, oldest first; a month without receipts is a zero.
	Months []GroupOverviewMonth `json:"months"`
}

// GroupOverviewCategory is one category's spend in the month. A receipt counts in full toward each
// of its categories, as on the pie chart widget, so these can add up to more than the month's total.
type GroupOverviewCategory struct {
	Name  string          `json:"name"`
	Total decimal.Decimal `json:"total"`
}

type GroupOverviewMonth struct {
	Month string          `json:"month"`
	Total decimal.Decimal `json:"total"`
}
