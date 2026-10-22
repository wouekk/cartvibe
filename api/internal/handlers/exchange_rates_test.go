package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"net/http"
	"testing"

	"github.com/shopspring/decimal"
)

func TestExchangeRatesAreAdminOnly(t *testing.T) {
	defer repositories.TruncateTestDb()

	w, r := shoppingListRequest("GET", "", 1, nil)
	GetExchangeRates(w, r)
	assertStatus(t, w, http.StatusForbidden)

	w, r = shoppingListRequest("PUT", `{"rates":[]}`, 1, nil)
	UpdateExchangeRates(w, r)
	assertStatus(t, w, http.StatusForbidden)
}

func TestExchangeRatesRoundTripAndAreNormalised(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAllAppPerms(t, 1)

	w, r := shoppingListRequest("PUT", `{"rates":[{"code":"chf","rate":"1.04"},{"code":"PLN","rate":null},{"code":"GBP","rate":"1.17"}]}`, 1, nil)
	UpdateExchangeRates(w, r)
	assertStatus(t, w, http.StatusOK)

	view := decodeShoppingListResponse[structs.ExchangeRatesView](t, w)
	if view.MainCurrency != "USD" {
		t.Errorf("the test database's main currency is $, got %q", view.MainCurrency)
	}
	if len(view.Rates) != 3 || view.Rates[0].Code != "CHF" || view.Rates[0].Rate == nil || view.Rates[0].Rate.String() != "1.04" ||
		view.Rates[1].Code != "GBP" || view.Rates[2].Code != "PLN" || view.Rates[2].Rate != nil {
		t.Errorf("unexpected rates: %+v", view.Rates)
	}

	// A second save replaces the set: PLN is removed, CHF changes.
	w, r = shoppingListRequest("PUT", `{"rates":[{"code":"CHF","rate":"1.10"}]}`, 1, nil)
	UpdateExchangeRates(w, r)
	assertStatus(t, w, http.StatusOK)
	w, r = shoppingListRequest("GET", "", 1, nil)
	GetExchangeRates(w, r)
	view = decodeShoppingListResponse[structs.ExchangeRatesView](t, w)
	if len(view.Rates) != 1 || view.Rates[0].Rate.String() != "1.1" {
		t.Errorf("unexpected rates after the second save: %+v", view.Rates)
	}
}

func TestExchangeRatesRejectBadRows(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAllAppPerms(t, 1)

	for name, body := range map[string]string{
		"not three letters": `{"rates":[{"code":"EURO","rate":"1"}]}`,
		"the main currency": `{"rates":[{"code":"USD","rate":"1"}]}`,
		"a repeat":          `{"rates":[{"code":"CHF","rate":"1"},{"code":"chf","rate":"2"}]}`,
		"zero":              `{"rates":[{"code":"CHF","rate":"0"}]}`,
		"negative":          `{"rates":[{"code":"CHF","rate":"-1"}]}`,
		"absurd":            `{"rates":[{"code":"CHF","rate":"1000000"}]}`,
	} {
		w, r := shoppingListRequest("PUT", body, 1, nil)
		UpdateExchangeRates(w, r)
		if w.Result().StatusCode != http.StatusBadRequest {
			t.Errorf("%s: expected 400, got %d", name, w.Result().StatusCode)
		}
	}
}

func TestSavingARateConvertsReceiptsWaitingForIt(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestGroupWithUsers()
	grantAllAppPerms(t, 1)

	original := decimal.RequireFromString("50")
	receipt := models.Receipt{Name: "Swiss shop", Amount: original, GroupId: 1, PaidByUserID: 1, OriginalAmount: &original, OriginalCurrency: "CHF"}
	repositories.GetDB().Create(&receipt)

	w, r := shoppingListRequest("PUT", `{"rates":[{"code":"CHF","rate":"1.04"}]}`, 1, nil)
	UpdateExchangeRates(w, r)
	assertStatus(t, w, http.StatusOK)

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.Amount.String() != "52" || stored.ExchangeRate == nil || stored.ExchangeRate.String() != "1.04" {
		t.Errorf("the waiting receipt should convert when its rate is saved: %s %v", stored.Amount, stored.ExchangeRate)
	}
}
