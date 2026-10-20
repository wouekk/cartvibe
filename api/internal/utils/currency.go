package utils

import "strings"

// currencyAliases maps the ways a receipt (or the AI) writes a currency onto its ISO code. Polish
// receipts often print "zł", British ones "£" or "pounds", Swiss ones "Fr." or "SFr.".
var currencyAliases = map[string]string{
	"eur": "EUR", "euro": "EUR", "euros": "EUR", "€": "EUR",
	"pln": "PLN", "zł": "PLN", "zl": "PLN", "zloty": "PLN", "złoty": "PLN", "złotych": "PLN", "zlotych": "PLN", "pln.": "PLN",
	"gbp": "GBP", "£": "GBP", "pound": "GBP", "pounds": "GBP", "pound sterling": "GBP", "pounds sterling": "GBP", "sterling": "GBP", "gb£": "GBP",
	"chf": "CHF", "fr": "CHF", "fr.": "CHF", "sfr": "CHF", "sfr.": "CHF", "franken": "CHF", "swiss franc": "CHF", "swiss francs": "CHF", "francs": "CHF",
	"usd": "USD", "$": "USD", "us$": "USD", "dollar": "USD", "dollars": "USD", "us dollar": "USD", "us dollars": "USD",
}

// NormalizeCurrencyCode turns whatever the AI wrote into an ISO 4217 code: a known spelling maps to its
// code, any other three letters are kept upper case, and anything else is "" (unknown).
func NormalizeCurrencyCode(raw string) string {
	text := strings.ToLower(strings.TrimSpace(raw))
	if text == "" {
		return ""
	}

	if code, found := currencyAliases[text]; found {
		return code
	}

	if len([]rune(text)) == 3 && strings.IndexFunc(text, func(r rune) bool { return r < 'a' || r > 'z' }) == -1 {
		return strings.ToUpper(text)
	}

	return ""
}

// MainCurrencyCode is the ISO code of the household's main currency, read from the symbol the currency
// setting shows (" €", "$", "zł", ...). It is "" for a custom symbol, in which case nothing is converted.
func MainCurrencyCode(currencyDisplay string) string {
	return NormalizeCurrencyCode(currencyDisplay)
}
