package structs

import "github.com/shopspring/decimal"

// GroupOverview is the Dashboard's period at a glance: the period's totals compared with the period
// before it, its spending by category, and a trend. Amounts are decimals, strings on the wire.
type GroupOverview struct {
	// Month is the month the period starts in, "yyyy-MM", kept for clients that only know months.
	Month string `json:"month"`
	// From and To are the period's first and last day, "yyyy-MM-dd" (Phase 3 D1, decision Q10).
	From string `json:"from"`
	To   string `json:"to"`
	// PreviousFrom and PreviousTo are the period the Previous* figures describe: the calendar months
	// right before a whole-month period, otherwise the same number of days right before it.
	PreviousFrom  string          `json:"previousFrom"`
	PreviousTo    string          `json:"previousTo"`
	Total         decimal.Decimal `json:"total"`
	PreviousTotal decimal.Decimal `json:"previousTotal"`
	ReceiptCount  int64           `json:"receiptCount"`
	// PreviousReceiptCount is ReceiptCount for the previous period.
	PreviousReceiptCount int64 `json:"previousReceiptCount"`
	// OpenReceiptCount counts the period's receipts still to check (OPEN, NEEDS_ATTENTION or DRAFT).
	OpenReceiptCount int64 `json:"openReceiptCount"`
	// UnhealthyTotal is what the period's products rated unhealthy cost (Phase 2b tags), whatever the
	// receipt's category. Products without a price, or not rated yet, do not count.
	UnhealthyTotal         decimal.Decimal `json:"unhealthyTotal"`
	PreviousUnhealthyTotal decimal.Decimal `json:"previousUnhealthyTotal"`
	// UnplannedTotal is what the period's products marked "not on the shopping list" cost (Phase 2c).
	UnplannedTotal         decimal.Decimal         `json:"unplannedTotal"`
	PreviousUnplannedTotal decimal.Decimal         `json:"previousUnplannedTotal"`
	Categories             []GroupOverviewCategory `json:"categories"`
	// Months are the six months ending with the period's last month, oldest first; a month without
	// receipts is a zero.
	Months []GroupOverviewMonth `json:"months"`
	// Trend is what the chart draws: months for a period of a month or more, days for a shorter one.
	// TrendUnit says which ("MONTH" or "DAY"), a plain string so another unit can follow. Each point's
	// Month holds "yyyy-MM" or "yyyy-MM-dd" accordingly.
	Trend     []GroupOverviewMonth `json:"trend"`
	TrendUnit string               `json:"trendUnit"`
}

// GroupOverviewCategory is one category's spend in the period. A receipt counts in full toward each
// of its categories, as on the pie chart widget, so these can add up to more than the period's total.
type GroupOverviewCategory struct {
	Name  string          `json:"name"`
	Total decimal.Decimal `json:"total"`
}

type GroupOverviewMonth struct {
	Month string          `json:"month"`
	Total decimal.Decimal `json:"total"`
}

// GroupOverviewProduct is one product line behind a Dashboard tile (Unhealthy or Unplanned), with the
// receipt it is on, so the tile can show what makes up its figure.
type GroupOverviewProduct struct {
	Id          uint             `json:"id"`
	ReceiptId   uint             `json:"receiptId"`
	ReceiptName string           `json:"receiptName"`
	ReceiptDate string           `json:"receiptDate"`
	Name        string           `json:"name"`
	Amount      *decimal.Decimal `json:"amount"`
	Quantity    string           `json:"quantity"`
	Health      string           `json:"health"`
	Planned     *bool            `json:"planned"`
}
