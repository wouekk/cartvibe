package commands

import (
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestUpsertReceiptProductCommandValidate(t *testing.T) {
	price := func(s string) *decimal.Decimal { d := decimal.RequireFromString(s); return &d }

	valid := []UpsertReceiptProductCommand{
		{Name: "Milk"},
		{Name: "Milk", Amount: price("1.09"), Quantity: "2 x 1L"},
		{Name: "Return", Amount: price("-3.50")},
	}
	for _, command := range valid {
		if errs := command.Validate().Errors; len(errs) > 0 {
			t.Errorf("%+v should be valid, got %v", command, errs)
		}
	}

	invalid := map[string]UpsertReceiptProductCommand{
		"name":     {Name: ""},
		"quantity": {Name: "x", Quantity: strings.Repeat("a", 51)},
		"amount":   {Name: "x", Amount: price("1.234")},
	}
	for field, command := range invalid {
		if _, ok := command.Validate().Errors[field]; !ok {
			t.Errorf("expected an error on %s for %+v", field, command)
		}
	}

	tooLong := UpsertReceiptProductCommand{Name: strings.Repeat("n", 201)}
	if _, ok := tooLong.Validate().Errors["name"]; !ok {
		t.Error("expected an error for a name over 200 characters")
	}
	huge := UpsertReceiptProductCommand{Name: "x", Amount: price("100000000")}
	if _, ok := huge.Validate().Errors["amount"]; !ok {
		t.Error("expected an error for an amount that does not fit the column")
	}
}
