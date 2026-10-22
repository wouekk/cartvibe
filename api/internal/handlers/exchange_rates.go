package handlers

import (
	"encoding/json"
	"net/http"
	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"regexp"
	"strconv"
	"strings"

	"github.com/shopspring/decimal"
)

var currencyCodePattern = regexp.MustCompile(`^[A-Z]{3}$`)

// maxExchangeRate keeps a typo (a rate of a million) out of every total; the column holds far more.
var maxExchangeRate = decimal.NewFromInt(100000)

func exchangeRatesView(settings models.SystemSettings, rates []models.ExchangeRate) structs.ExchangeRatesView {
	view := structs.ExchangeRatesView{
		MainCurrency: services.MainCurrencyCode(settings.CurrencyDisplay),
		Rates:        make([]structs.ExchangeRateView, 0, len(rates)),
	}
	for _, rate := range rates {
		view.Rates = append(view.Rates, structs.ExchangeRateView{Code: rate.Code, Rate: rate.Rate})
	}

	return view
}

func writeExchangeRates(w http.ResponseWriter) (int, error) {
	settings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
	if err != nil {
		return http.StatusInternalServerError, err
	}
	rates, err := repositories.NewExchangeRateRepository(nil).GetAll()
	if err != nil {
		return http.StatusInternalServerError, err
	}

	bytes, err := utils.MarshalResponseData(exchangeRatesView(settings, rates))
	if err != nil {
		return http.StatusInternalServerError, err
	}

	w.WriteHeader(http.StatusOK)
	w.Write(bytes)
	return 0, nil
}

// GetExchangeRates returns the main currency and the household's rate table (Phase 3 currencies).
func GetExchangeRates(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error getting exchange rates",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppSystemSettingsRead},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			return writeExchangeRates(w)
		},
	}

	HandleRequest(handler)
}

// UpdateExchangeRates replaces the rate table. A rate that is now set converts the receipts that were
// saved in that currency while it had none; receipts that already carry a rate are left as they are.
func UpdateExchangeRates(w http.ResponseWriter, r *http.Request) {
	handler := structs.Handler{
		ErrorMessage:   "Error updating exchange rates",
		Writer:         w,
		Request:        r,
		AppPermissions: []string{permissions.AppSystemSettingsUpdate},
		ResponseType:   constants.ApplicationJson,
		HandlerFunction: func(w http.ResponseWriter, r *http.Request) (int, error) {
			bytes, err := utils.GetBodyData(w, r)
			if err != nil {
				return http.StatusInternalServerError, err
			}

			command := structs.ExchangeRatesView{}
			if err := json.Unmarshal(bytes, &command); err != nil {
				return http.StatusBadRequest, err
			}

			settings, err := repositories.NewSystemSettingsRepository(nil).GetSystemSettings()
			if err != nil {
				return http.StatusInternalServerError, err
			}

			rates, vErr := validateExchangeRates(command.Rates, services.MainCurrencyCode(settings.CurrencyDisplay))
			if len(vErr.Errors) > 0 {
				structs.WriteValidatorErrorResponse(w, vErr, http.StatusBadRequest)
				return 0, nil
			}

			if _, err := repositories.NewExchangeRateRepository(nil).ReplaceAll(rates); err != nil {
				return http.StatusInternalServerError, err
			}

			if _, err := services.ApplyRatesToWaitingReceipts(); err != nil {
				return http.StatusInternalServerError, err
			}

			return writeExchangeRates(w)
		},
	}

	HandleRequest(handler)
}

// validateExchangeRates checks the submitted rows: a three-letter code each, no repeats, not the main
// currency itself, and a rate that is empty (not entered yet) or positive and sane.
func validateExchangeRates(rows []structs.ExchangeRateView, mainCode string) ([]models.ExchangeRate, structs.ValidatorError) {
	vErr := structs.ValidatorError{Errors: map[string]string{}}
	rates := make([]models.ExchangeRate, 0, len(rows))
	seen := map[string]bool{}

	for i, row := range rows {
		code := strings.ToUpper(strings.TrimSpace(row.Code))
		key := "rates." + strconv.Itoa(i)

		switch {
		case !currencyCodePattern.MatchString(code):
			vErr.Errors[key+".code"] = "A currency code is three letters, like CHF"
		case code == mainCode:
			vErr.Errors[key+".code"] = "This is the main currency, it needs no rate"
		case seen[code]:
			vErr.Errors[key+".code"] = "This currency is listed twice"
		}
		seen[code] = true

		if row.Rate != nil && (!row.Rate.IsPositive() || row.Rate.GreaterThanOrEqual(maxExchangeRate)) {
			vErr.Errors[key+".rate"] = "A rate must be greater than 0 and below 100000"
		}

		rates = append(rates, models.ExchangeRate{Code: code, Rate: row.Rate})
	}

	return rates, vErr
}
