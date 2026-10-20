package services

import (

	"github.com/shopspring/decimal"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/utils"
)

// DefaultExchangeCurrencies are listed in the rate table from the start; their rates are typed in.
var DefaultExchangeCurrencies = []string{"CHF", "PLN", "GBP", "USD"}

// ConvertAmount multiplies an amount by a rate and rounds to cents.
func ConvertAmount(amount decimal.Decimal, rate decimal.Decimal) decimal.Decimal {
	return amount.Mul(rate).Round(2)
}

// currencyContext is what converting a receipt needs: the main currency and the rates by code.
type currencyContext struct {
	main  string
	rates map[string]decimal.Decimal
}

func loadCurrencyContext() (currencyContext, error) {
	settings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		return currencyContext{}, err
	}

	rates, err := repositories.NewExchangeRateRepository(nil).GetAll()
	if err != nil {
		return currencyContext{}, err
	}

	context := currencyContext{main: MainCurrencyCode(settings.CurrencyDisplay), rates: map[string]decimal.Decimal{}}
	for _, rate := range rates {
		if rate.Rate != nil && rate.Rate.IsPositive() {
			context.rates[rate.Code] = *rate.Rate
		}
	}

	return context, nil
}

// foreign reports whether a code names a currency other than the main one that should be converted.
func (context currencyContext) foreign(code string) bool {
	return context.main != "" && code != "" && code != context.main
}

// lookup returns the rate for a code, if one has been entered.
func (context currencyContext) lookup(code string) (decimal.Decimal, bool) {
	rate, found := context.rates[code]
	return rate, found
}

// convertCommand applies the currency a receipt was read in to a receipt about to be created (Phase 3
// currencies). In the main currency, or one that was not recognised, nothing changes. In a currency with a
// rate the amount is converted and the original kept. In a currency without a rate the amount stays as read
// and the receipt records the currency, so it can be flagged and converted once a rate is added.
func (context currencyContext) convertCommand(command *commands.UpsertReceiptCommand) {
	code := NormalizeCurrencyCode(command.Currency)
	if !context.foreign(code) || command.OriginalCurrency != "" {
		return
	}

	original := command.Amount
	command.OriginalAmount = &original
	command.OriginalCurrency = code

	if rate, found := context.lookup(code); found {
		command.Amount = ConvertAmount(original, rate)
		command.ExchangeRate = &rate
	}
}

// ApplyReceiptCurrency converts a freshly read receipt command in place, using the household's main
// currency and rates. A failure to load them leaves the command as read: nothing may fail because of this.
func ApplyReceiptCurrency(command *commands.UpsertReceiptCommand) {
	context, err := loadCurrencyContext()
	if err != nil {
		return
	}

	context.convertCommand(command)
}

// RateMissing reports whether a receipt waits for a rate: it was in another currency and has none.
func RateMissing(receipt models.Receipt) bool {
	return receipt.OriginalCurrency != "" && receipt.ExchangeRate == nil
}

// receiptRate decides which currency and rate a read applies to a receipt. A receipt already recorded in
// another currency keeps it (and its rate, or the table's if it was still waiting); otherwise the currency
// the AI just read counts. The returned rate is nil in the main currency and when no rate is known.
func (context currencyContext) receiptRate(receipt models.Receipt, readCurrency string) (string, *decimal.Decimal) {
	code := receipt.OriginalCurrency
	if code == "" {
		code = readCurrency
	}
	if !context.foreign(code) {
		return "", nil
	}

	if receipt.OriginalCurrency == code && receipt.ExchangeRate != nil {
		return code, receipt.ExchangeRate
	}

	if rate, found := context.lookup(code); found {
		return code, &rate
	}

	return code, nil
}

// ApplyRatesToWaitingReceipts converts the receipts that were saved in another currency while no rate
// was known, now that one is (Phase 3 currencies): each gets its amount converted from the original and the
// rate recorded, and its products queued to be read again so their amounts follow. It returns how many
// receipts changed. Receipts that already carry a rate are never touched, so editing a rate later does not
// rewrite history.
func ApplyRatesToWaitingReceipts() (int, error) {
	context, err := loadCurrencyContext()
	if err != nil {
		return 0, err
	}

	db := repositories.GetDB()
	var waiting []models.Receipt
	err = db.Where("original_currency <> ? AND exchange_rate IS NULL AND original_amount IS NOT NULL", "").Find(&waiting).Error
	if err != nil {
		return 0, err
	}

	productRepository := repositories.NewReceiptProductRepository(nil)
	changed := 0
	for _, receipt := range waiting {
		rate, found := context.lookup(receipt.OriginalCurrency)
		if !found {
			continue
		}

		err = db.Model(&models.Receipt{}).Where("id = ?", receipt.ID).Updates(map[string]any{
			"amount":        ConvertAmount(*receipt.OriginalAmount, rate),
			"exchange_rate": rate,
		}).Error
		if err != nil {
			return changed, err
		}

		// Products convert when they are read; a receipt with no image has none to read.
		var images int64
		db.Model(&models.FileData{}).Where("receipt_id = ?", receipt.ID).Count(&images)
		if images > 0 {
			_ = productRepository.MarkReceiptProductsPending(receipt.ID)
		}
		changed++
	}

	return changed, nil
}

// NormalizeCurrencyCode: see utils.NormalizeCurrencyCode.
func NormalizeCurrencyCode(raw string) string { return utils.NormalizeCurrencyCode(raw) }

// MainCurrencyCode: see utils.MainCurrencyCode.
func MainCurrencyCode(currencyDisplay string) string { return utils.MainCurrencyCode(currencyDisplay) }
