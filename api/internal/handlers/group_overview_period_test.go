package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
)

func callOverviewHandler(handler http.HandlerFunc, userId uint, groupId string, query string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(http.MethodGet, "/api/overview/group/"+groupId+query, nil)

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("groupId", groupId)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, chiContext))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{},
		&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}}))

	handler(w, r)
	return w
}

func TestOverviewForARangeComparesWithTheSameLengthBefore(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	seedOverviewReceipt(t, "2026-10-12", "10.00", models.RESOLVED)
	seedOverviewReceipt(t, "2026-10-18", "5.00", models.OPEN)
	seedOverviewReceipt(t, "2026-10-05", "7.00", models.RESOLVED)
	// Outside both the week and the week before it.
	seedOverviewReceipt(t, "2026-09-01", "99.00", models.RESOLVED)

	w := callOverviewHandler(GetGroupOverview, 1, "1", "?from=2026-10-12&to=2026-10-18")
	assertStatus(t, w, http.StatusOK)
	overview := decodeShoppingListResponse[structs.GroupOverview](t, w)

	if !overview.Total.Equal(decimal.RequireFromString("15")) || overview.ReceiptCount != 2 || overview.OpenReceiptCount != 1 {
		t.Errorf("unexpected week figures: total %s, %d receipts, %d open", overview.Total, overview.ReceiptCount, overview.OpenReceiptCount)
	}
	if !overview.PreviousTotal.Equal(decimal.RequireFromString("7")) || overview.PreviousReceiptCount != 1 {
		t.Errorf("unexpected previous week: %s, %d", overview.PreviousTotal, overview.PreviousReceiptCount)
	}
	if overview.From != "2026-10-12" || overview.To != "2026-10-18" || overview.PreviousFrom != "2026-10-05" || overview.PreviousTo != "2026-10-11" {
		t.Errorf("unexpected period labels: %+v", overview)
	}
	if overview.TrendUnit != "DAY" || len(overview.Trend) != 7 {
		t.Errorf("a week should trend by day: %s %d", overview.TrendUnit, len(overview.Trend))
	}
}

func TestOverviewRejectsAHalfGivenOrBackwardsRange(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	for _, query := range []string{"?from=2026-10-12", "?from=2026-10-18&to=2026-10-12", "?from=x&to=y"} {
		assertStatus(t, callOverviewHandler(GetGroupOverview, 1, "1", query), http.StatusBadRequest)
	}
}

func TestOverviewProductsListsWhatMakesUpAnUnplannedOrUnhealthyTile(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	october := seedOverviewReceipt(t, "2026-10-03", "30.00", models.RESOLVED)
	september := seedOverviewReceipt(t, "2026-09-03", "30.00", models.RESOLVED)
	notPlanned := false
	planned := true
	price := decimal.RequireFromString("2.00")
	for _, product := range []models.ReceiptProduct{
		{ReceiptId: october.ID, Name: "CHIPS", DisplayName: "Crisps", Amount: &price, Planned: &notPlanned},
		{ReceiptId: october.ID, Name: "LAIT", Planned: &planned},
		{ReceiptId: october.ID, Name: "COLA", Amount: &price, FoodClassification: models.FoodClassification{Health: models.HEALTH_UNHEALTHY}},
		{ReceiptId: september.ID, Name: "OLD", Planned: &notPlanned},
	} {
		repositories.GetDB().Create(&product)
	}

	w := callOverviewHandler(GetOverviewProducts, 1, "1", "?kind=UNPLANNED&month=2026-10")
	assertStatus(t, w, http.StatusOK)
	unplanned := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w)
	if len(unplanned) != 1 || unplanned[0].Name != "Crisps" || unplanned[0].ReceiptDate != "2026-10-03" {
		t.Errorf("unexpected unplanned products: %+v", unplanned)
	}

	w = callOverviewHandler(GetOverviewProducts, 1, "1", "?kind=UNHEALTHY&month=2026-10")
	unhealthy := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w)
	if len(unhealthy) != 1 || unhealthy[0].Name != "COLA" {
		t.Errorf("unexpected unhealthy products: %+v", unhealthy)
	}

	assertStatus(t, callOverviewHandler(GetOverviewProducts, 1, "1", "?kind=OTHER"), http.StatusBadRequest)

	// The overview's tile total agrees with the list behind it.
	w = callOverviewHandler(GetGroupOverview, 1, "1", "?month=2026-10")
	overview := decodeShoppingListResponse[structs.GroupOverview](t, w)
	if !overview.UnplannedTotal.Equal(price) || !overview.UnhealthyTotal.Equal(price) {
		t.Errorf("tile totals should match the lists: unplanned %s unhealthy %s", overview.UnplannedTotal, overview.UnhealthyTotal)
	}
}

func TestOverviewProductsNeedReceiptReadAccess(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()

	assertStatus(t, callOverviewHandler(GetOverviewProducts, 1, "1", "?kind=UNPLANNED"), http.StatusForbidden)
}

func TestOverviewProductsCanBeListedByFoodGroup(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	receipt := seedOverviewReceipt(t, "2026-10-03", "30.00", models.RESOLVED)
	seedFoodGroupProduct(t, receipt.ID, "Sweets & Snacks", "2.00")
	seedFoodGroupProduct(t, receipt.ID, "dairy", "1.00")
	seedFoodGroupProduct(t, receipt.ID, "", "0.50")

	w := callOverviewHandler(GetOverviewProducts, 1, "1", "?kind=FOODGROUP&foodGroup=sweets%20%26%20snacks&month=2026-10")
	assertStatus(t, w, http.StatusOK)
	snacks := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w)
	if len(snacks) != 1 || snacks[0].Amount == nil || snacks[0].Amount.String() != "2" {
		t.Errorf("expected the one snacks product, got %+v", snacks)
	}

	// An empty group is what the Dashboard calls Uncategorized.
	w = callOverviewHandler(GetOverviewProducts, 1, "1", "?kind=FOODGROUP&month=2026-10")
	uncategorized := decodeShoppingListResponse[[]structs.GroupOverviewProduct](t, w)
	if len(uncategorized) != 1 || uncategorized[0].Amount.String() != "0.5" {
		t.Errorf("expected the uncategorized product, got %+v", uncategorized)
	}
}
