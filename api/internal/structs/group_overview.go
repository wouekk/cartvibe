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
	// OpenReceiptCount counts the month's receipts still needing action (OPEN or NEEDS_ATTENTION).
	OpenReceiptCount int64                   `json:"openReceiptCount"`
	Categories       []GroupOverviewCategory `json:"categories"`
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
