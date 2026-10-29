package services

import (
	"testing"

	"cartvibe/api/internal/models"

	"github.com/shopspring/decimal"
)

func linesOf(amounts ...string) []models.ReceiptProduct {
	products := make([]models.ReceiptProduct, 0, len(amounts))
	for _, raw := range amounts {
		product := models.ReceiptProduct{Name: "line"}
		if raw != "" {
			amount := decimal.RequireFromString(raw)
			product.Amount = &amount
		}
		products = append(products, product)
	}
	return products
}

func amountsOf(products []models.ReceiptProduct) []string {
	out := make([]string, 0, len(products))
	for _, product := range products {
		if product.Amount == nil {
			out = append(out, "")
			continue
		}
		out = append(out, product.Amount.StringFixed(2))
	}
	return out
}

// The Apple invoice: one line at 1 165,83 € HT, 20 % VAT 233,17 €, paid 1 399,00 €.
func TestGrossUpNetLinesOneLineInvoice(t *testing.T) {
	products := linesOf("1165.83")
	if !GrossUpNetLines(products, decimal.RequireFromString("1399.00")) {
		t.Fatal("expected the net line to be grossed up")
	}
	if got := amountsOf(products)[0]; got != "1399.00" {
		t.Errorf("expected 1399.00, got %s", got)
	}
}

// Several net lines at one rate: each grows by the rate and the lines add up to the total exactly.
func TestGrossUpNetLinesSeveralLinesAddUpToTheTotal(t *testing.T) {
	products := linesOf("10.00", "20.01", "", "5.55")
	// (10.00 + 20.01 + 5.55) * 1.23 = 43.7388 → printed 43.74 (Polish 23 %)
	if !GrossUpNetLines(products, decimal.RequireFromString("43.74")) {
		t.Fatal("expected the net lines to be grossed up")
	}
	got := amountsOf(products)
	if got[0] != "12.30" || got[1] != "24.61" || got[2] != "" {
		t.Errorf("unexpected scaled lines %v", got)
	}
	sum := decimal.Zero
	for _, product := range products {
		if product.Amount != nil {
			sum = sum.Add(*product.Amount)
		}
	}
	if !sum.Equal(decimal.RequireFromString("43.74")) {
		t.Errorf("the lines should add up to the total, got %s", sum)
	}
}

// Lines that already include tax, a gap that is no VAT rate (an unlisted item), discounts and refunds stay as read.
func TestGrossUpNetLinesLeavesOtherReceiptsAlone(t *testing.T) {
	cases := []struct {
		name  string
		lines []string
		total string
	}{
		{"already the total", []string{"12.50", "7.50"}, "20.00"},
		{"an unlisted item", []string{"12.50", "7.50"}, "26.10"},
		{"a discount line", []string{"20.00", "-2.00"}, "21.60"},
		{"a refund", []string{"10.00"}, "-12.00"},
		{"no priced lines", []string{"", ""}, "12.00"},
		{"more than the total", []string{"30.00"}, "20.00"},
	}
	for _, c := range cases {
		products := linesOf(c.lines...)
		before := amountsOf(products)
		if GrossUpNetLines(products, decimal.RequireFromString(c.total)) {
			t.Errorf("%s: should not be grossed up", c.name)
		}
		after := amountsOf(products)
		for i := range before {
			if before[i] != after[i] {
				t.Errorf("%s: line %d changed from %s to %s", c.name, i, before[i], after[i])
			}
		}
	}
}
