package structs

import "github.com/shopspring/decimal"

// ExchangeRatesView is the household's rate table with the main currency it converts into. It is also the
// request body of the update, which reads only Rates.
type ExchangeRatesView struct {
	// MainCurrency is the ISO code of the main currency; empty when the currency setting uses a custom
	// symbol, in which case nothing is converted.
	MainCurrency string             `json:"mainCurrency"`
	Rates        []ExchangeRateView `json:"rates"`
}

// ExchangeRateView is one listed currency. Rate is how many units of the main currency one unit of Code
// is worth; nil until it has been entered.
type ExchangeRateView struct {
	Code string           `json:"code"`
	Rate *decimal.Decimal `json:"rate"`
}
