package services

import (
	"testing"

	"github.com/shopspring/decimal"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
)

func dec(s string) decimal.Decimal { return decimal.RequireFromString(s) }

func TestNormalizeCurrencyCodeReadsHowReceiptsWriteCurrencies(t *testing.T) {
	cases := map[string]string{
		"PLN": "PLN", "pln": "PLN", "zł": "PLN", "ZŁ": "PLN", "zl": "PLN", "złoty": "PLN", "złotych": "PLN",
		"£": "GBP", "GBP": "GBP", "Pounds": "GBP", "pound sterling": "GBP",
		"CHF": "CHF", "Fr.": "CHF", "SFr.": "CHF", "Franken": "CHF",
		"$": "USD", "USD": "USD", "US Dollars": "USD",
		"€": "EUR", "euro": "EUR", " EUR ": "EUR",
		"sek": "SEK",
		"":    "", "  ": "", "money": "", "12": "", "zloty coins": "",
	}
	for raw, expected := range cases {
		if got := NormalizeCurrencyCode(raw); got != expected {
			t.Errorf("%q: expected %q, got %q", raw, expected, got)
		}
	}
}

func TestMainCurrencyCodeComesFromTheSymbol(t *testing.T) {
	for symbol, expected := range map[string]string{" €": "EUR", "$": "USD", "zł": "PLN", " zł": "PLN", "£": "GBP", "CHF": "CHF", "kr": ""} {
		if got := MainCurrencyCode(symbol); got != expected && !(symbol == "kr" && got == "") {
			t.Errorf("%q: expected %q, got %q", symbol, expected, got)
		}
	}
}

func TestConvertCommandConvertsKeepsTheOriginalAndFlagsAMissingRate(t *testing.T) {
	context := currencyContext{main: "EUR", rates: map[string]decimal.Decimal{"CHF": dec("1.04"), "PLN": dec("0.23")}}

	chf := commands.UpsertReceiptCommand{Amount: dec("45.90"), Currency: "CHF"}
	context.convertCommand(&chf)
	if chf.Amount.String() != "47.74" || chf.OriginalAmount == nil || chf.OriginalAmount.String() != "45.9" ||
		chf.OriginalCurrency != "CHF" || chf.ExchangeRate == nil || chf.ExchangeRate.String() != "1.04" {
		t.Errorf("unexpected CHF conversion: %+v", chf)
	}

	zloty := commands.UpsertReceiptCommand{Amount: dec("100"), Currency: "zł"}
	context.convertCommand(&zloty)
	if zloty.Amount.String() != "23" || zloty.OriginalCurrency != "PLN" {
		t.Errorf("zł should be read as PLN and converted: %+v", zloty)
	}

	pounds := commands.UpsertReceiptCommand{Amount: dec("12.50"), Currency: "£"}
	context.convertCommand(&pounds)
	if pounds.Amount.String() != "12.5" || pounds.OriginalCurrency != "GBP" || pounds.ExchangeRate != nil || pounds.OriginalAmount == nil {
		t.Errorf("a currency without a rate should stay unconverted and be recorded: %+v", pounds)
	}

	for _, currency := range []string{"EUR", "€", "", "mystery"} {
		untouched := commands.UpsertReceiptCommand{Amount: dec("10"), Currency: currency}
		context.convertCommand(&untouched)
		if untouched.Amount.String() != "10" || untouched.OriginalCurrency != "" || untouched.OriginalAmount != nil {
			t.Errorf("%q should change nothing: %+v", currency, untouched)
		}
	}

	// Never converts twice.
	again := chf
	context.convertCommand(&again)
	if again.Amount.String() != "47.74" {
		t.Errorf("a converted command must not be converted again, got %s", again.Amount)
	}

	// No main currency (a custom symbol): nothing is converted.
	custom := currencyContext{main: "", rates: context.rates}
	skipped := commands.UpsertReceiptCommand{Amount: dec("10"), Currency: "CHF"}
	custom.convertCommand(&skipped)
	if skipped.OriginalCurrency != "" {
		t.Errorf("a custom main currency should disable conversion: %+v", skipped)
	}
}

func TestReceiptRatePrefersTheReceiptsOwnFrozenRate(t *testing.T) {
	context := currencyContext{main: "EUR", rates: map[string]decimal.Decimal{"CHF": dec("1.10")}}
	frozen := dec("1.04")

	code, rate := context.receiptRate(models.Receipt{OriginalCurrency: "CHF", ExchangeRate: &frozen}, "")
	if code != "CHF" || rate == nil || rate.String() != "1.04" {
		t.Errorf("a converted receipt keeps its own rate, got %s %v", code, rate)
	}

	code, rate = context.receiptRate(models.Receipt{OriginalCurrency: "CHF"}, "")
	if code != "CHF" || rate == nil || rate.String() != "1.1" {
		t.Errorf("a waiting receipt takes the table's rate, got %s %v", code, rate)
	}

	code, rate = context.receiptRate(models.Receipt{}, "CHF")
	if code != "CHF" || rate == nil {
		t.Errorf("a read currency counts for a receipt with none, got %s %v", code, rate)
	}

	code, rate = context.receiptRate(models.Receipt{}, "GBP")
	if code != "GBP" || rate != nil {
		t.Errorf("an unknown rate gives the currency and no rate, got %s %v", code, rate)
	}

	if code, rate = context.receiptRate(models.Receipt{}, "EUR"); code != "" || rate != nil {
		t.Errorf("the main currency needs nothing, got %s %v", code, rate)
	}
}

func TestApplyRatesToWaitingReceiptsConvertsOnlyThoseWithoutARate(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()
	// The test database's currency is "$", so USD is main here; use CHF as the foreign one.
	chf := dec("1.04")
	repositories.GetDB().Create(&models.ExchangeRate{Code: "CHF", Rate: &chf})

	original := dec("100")
	waiting := models.Receipt{Name: "waiting", Amount: original, GroupId: 1, PaidByUserID: 1, OriginalAmount: &original, OriginalCurrency: "CHF"}
	repositories.GetDB().Create(&waiting)
	frozenRate := dec("0.90")
	converted := models.Receipt{Name: "done", Amount: dec("90"), GroupId: 1, PaidByUserID: 1, OriginalAmount: &original, OriginalCurrency: "CHF", ExchangeRate: &frozenRate}
	repositories.GetDB().Create(&converted)

	changed, err := ApplyRatesToWaitingReceipts()
	if err != nil {
		t.Fatal(err)
	}
	if changed != 1 {
		t.Errorf("expected 1 receipt changed, got %d", changed)
	}

	var stored, untouched models.Receipt
	repositories.GetDB().First(&stored, waiting.ID)
	repositories.GetDB().First(&untouched, converted.ID)
	if stored.Amount.String() != "104" || stored.ExchangeRate == nil || stored.ExchangeRate.String() != "1.04" {
		t.Errorf("the waiting receipt should be converted: %s %v", stored.Amount, stored.ExchangeRate)
	}
	if untouched.Amount.String() != "90" || untouched.ExchangeRate.String() != "0.9" {
		t.Errorf("a receipt with its own rate must not change: %s %v", untouched.Amount, untouched.ExchangeRate)
	}
}

func TestParseCurrencyReadsTheProductAnswer(t *testing.T) {
	for response, expected := range map[string]string{
		`{"currency": "zł", "products": []}`:  "PLN",
		`{"currency": "£", "products": []}`:   "GBP",
		`{"currency": "", "products": []}`:    "",
		`{"products": []}`:                    "",
		`{"currency": null, "products": []}`:  "",
		`not json`:                            "",
		`{"currency": "Fr.", "products": []}`: "CHF",
	} {
		if got := parseCurrency(response); got != expected {
			t.Errorf("%s: expected %q, got %q", response, expected, got)
		}
	}
}
