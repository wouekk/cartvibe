package services

import (
	"cartvibe/api/internal/models"

	"github.com/shopspring/decimal"
)

// vatRates are the VAT rates (as fractions) an invoice that prints its line prices before tax may use: the
// standard and common reduced rates of the EU and its neighbours. Only a whole-invoice match on one of them grosses
// the lines up.
var vatRates = []string{
	"0.05", "0.055", "0.07", "0.08", "0.081", "0.09", "0.10", "0.12", "0.13", "0.14", "0.15", "0.17", "0.19",
	"0.20", "0.21", "0.22", "0.23", "0.24", "0.25", "0.255", "0.27",
}

// GrossUpNetLines turns product lines read at their net price (an invoice that prints prices "HT", "net" or "excl.
// VAT" and adds the tax at the bottom) into what was paid. It acts only when every priced line together, plus one
// VAT rate, makes the receipt total (to a cent per line, for the invoice's own rounding): each line is then scaled to
// the total, and the last priced line takes the rounding cent, so the lines add up to the total exactly. Anything else
// (lines that already include tax, an unlisted item, mixed rates) is left as read. It reports whether it scaled.
//
// total is the receipt's amount in the currency the lines were read in.
func GrossUpNetLines(products []models.ReceiptProduct, total decimal.Decimal) bool {
	if !total.IsPositive() {
		return false
	}

	sum := decimal.Zero
	priced := 0
	last := -1
	for i, product := range products {
		if product.Amount == nil {
			continue
		}
		if product.Amount.IsNegative() {
			// A discount line: the gap is not a tax.
			return false
		}
		sum = sum.Add(*product.Amount)
		priced++
		last = i
	}
	if priced == 0 || !sum.IsPositive() || sum.GreaterThanOrEqual(total) {
		return false
	}

	tolerance := decimal.NewFromFloat(0.01).Mul(decimal.NewFromInt(int64(priced)))
	matched := false
	for _, raw := range vatRates {
		rate := decimal.RequireFromString(raw)
		gross := sum.Mul(decimal.NewFromInt(1).Add(rate))
		if gross.Sub(total).Abs().LessThanOrEqual(tolerance) {
			matched = true
			break
		}
	}
	if !matched {
		return false
	}

	factor := total.Div(sum)
	scaledSum := decimal.Zero
	for i := range products {
		if products[i].Amount == nil || i == last {
			continue
		}
		scaled := products[i].Amount.Mul(factor).Round(2)
		products[i].Amount = &scaled
		scaledSum = scaledSum.Add(scaled)
	}
	rest := total.Sub(scaledSum)
	products[last].Amount = &rest

	return true
}
