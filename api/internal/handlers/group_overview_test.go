package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/services"
	"receipt-wrangler/api/internal/structs"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
)

func tearDownGroupOverviewTest() {
	repositories.TruncateTestDb()
	services.ClearRolePermissionCacheForTests()
}

func callGetGroupOverview(userId uint, groupId string, month string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	target := "/api/overview/group/" + groupId
	if month != "" {
		target += "?month=" + month
	}
	r := httptest.NewRequest(http.MethodGet, target, nil)

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("groupId", groupId)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, chiContext))
	r = r.WithContext(context.WithValue(
		r.Context(),
		jwtmiddleware.ContextKey{},
		&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}},
	))

	GetGroupOverview(w, r)
	return w
}

// seedOverviewReceipt stores a receipt dated on a calendar day (midnight UTC, as the app stores it).
func seedOverviewReceipt(t *testing.T, day string, amount string, status models.ReceiptStatus, categories ...models.Category) models.Receipt {
	t.Helper()

	date, err := time.Parse(time.DateOnly, day)
	if err != nil {
		t.Fatalf("parse day: %v", err)
	}

	receipt := models.Receipt{
		Name:         "overview receipt",
		Amount:       decimal.RequireFromString(amount),
		Date:         date,
		PaidByUserID: 1,
		GroupId:      1,
		Status:       status,
		Categories:   categories,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt
}

// seedOverviewProduct stores a product line on a receipt; an empty amount stores none.
func seedOverviewProduct(t *testing.T, receiptId uint, health string, amount string) {
	t.Helper()

	product := models.ReceiptProduct{ReceiptId: receiptId, Name: "product"}
	product.Health = health
	if amount != "" {
		value := decimal.RequireFromString(amount)
		product.Amount = &value
	}
	if err := repositories.GetDB().Create(&product).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
}

func TestGroupOverviewSumsTheMonthsUnhealthyProducts(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	october := seedOverviewReceipt(t, "2026-10-03", "30.00", models.RESOLVED)
	seedOverviewProduct(t, october.ID, models.HEALTH_UNHEALTHY, "2.49")
	seedOverviewProduct(t, october.ID, models.HEALTH_UNHEALTHY, "1.30")
	seedOverviewProduct(t, october.ID, models.HEALTH_UNHEALTHY, "")
	seedOverviewProduct(t, october.ID, models.HEALTH_HEALTHY, "5.00")
	seedOverviewProduct(t, october.ID, "", "9.00")
	// Another month's unhealthy products are not this month's.
	september := seedOverviewReceipt(t, "2026-09-30", "10.00", models.RESOLVED)
	seedOverviewProduct(t, september.ID, models.HEALTH_UNHEALTHY, "4.00")

	w := callGetGroupOverview(1, "1", "2026-10")
	assertStatus(t, w, http.StatusOK)
	overview := decodeGroupOverview(t, w)

	if overview.UnhealthyTotal.String() != "3.79" {
		t.Errorf("expected unhealthy 3.79, got %s", overview.UnhealthyTotal)
	}
}

func decodeGroupOverview(t *testing.T, w *httptest.ResponseRecorder) structs.GroupOverview {
	t.Helper()
	overview := structs.GroupOverview{}
	if err := json.Unmarshal(w.Body.Bytes(), &overview); err != nil {
		t.Fatalf("decode overview: %v (body %s)", err, w.Body.String())
	}
	return overview
}

func TestGroupOverviewFoldsTheMonthAndItsTrend(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	groceries := models.Category{Name: "Groceries"}
	dining := models.Category{Name: "Dining out"}
	repositories.GetDB().Create(&groceries)
	repositories.GetDB().Create(&dining)

	seedOverviewReceipt(t, "2026-10-01", "84.20", models.OPEN, groceries)
	seedOverviewReceipt(t, "2026-10-31", "62.50", models.NEEDS_ATTENTION, dining)
	seedOverviewReceipt(t, "2026-10-15", "10.00", models.RESOLVED, groceries, dining)
	seedOverviewReceipt(t, "2026-10-16", "5.05", models.RESOLVED)
	seedOverviewReceipt(t, "2026-09-30", "100.00", models.RESOLVED, groceries)
	seedOverviewReceipt(t, "2026-05-01", "1.00", models.RESOLVED)
	// Outside the six-month window and after the month: ignored.
	seedOverviewReceipt(t, "2026-04-30", "999.00", models.RESOLVED)
	seedOverviewReceipt(t, "2026-11-01", "999.00", models.OPEN)

	w := callGetGroupOverview(1, "1", "2026-10")
	assertStatus(t, w, http.StatusOK)
	overview := decodeGroupOverview(t, w)

	if overview.Month != "2026-10" || overview.Total.String() != "161.75" || overview.PreviousTotal.String() != "100" {
		t.Errorf("unexpected totals: %+v", overview)
	}
	if overview.ReceiptCount != 4 || overview.OpenReceiptCount != 2 {
		t.Errorf("expected 4 receipts, 2 open; got %d, %d", overview.ReceiptCount, overview.OpenReceiptCount)
	}

	// A receipt counts toward each of its categories, as on the pie chart; largest first.
	expectedCategories := []struct{ name, total string }{
		{"Groceries", "94.2"}, {"Dining out", "72.5"}, {"Uncategorized", "5.05"},
	}
	if len(overview.Categories) != len(expectedCategories) {
		t.Fatalf("expected %d categories, got %+v", len(expectedCategories), overview.Categories)
	}
	for i, expected := range expectedCategories {
		if overview.Categories[i].Name != expected.name || overview.Categories[i].Total.String() != expected.total {
			t.Errorf("category %d: expected %s %s, got %+v", i, expected.name, expected.total, overview.Categories[i])
		}
	}

	// Six months, oldest first, empty ones as zeros.
	expectedMonths := []struct{ month, total string }{
		{"2026-05", "1"}, {"2026-06", "0"}, {"2026-07", "0"}, {"2026-08", "0"}, {"2026-09", "100"}, {"2026-10", "161.75"},
	}
	if len(overview.Months) != len(expectedMonths) {
		t.Fatalf("expected 6 months, got %+v", overview.Months)
	}
	for i, expected := range expectedMonths {
		if overview.Months[i].Month != expected.month || overview.Months[i].Total.String() != expected.total {
			t.Errorf("month %d: expected %s %s, got %+v", i, expected.month, expected.total, overview.Months[i])
		}
	}
}

func TestGroupOverviewEmptyGroupSendsArraysAndZeros(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w := callGetGroupOverview(1, "1", "2026-10")
	assertStatus(t, w, http.StatusOK)

	var raw map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// The generated Dart client has no null guard: lists must be [], never null.
	if categories, ok := raw["categories"].([]any); !ok || len(categories) != 0 {
		t.Errorf("expected categories [], got %v", raw["categories"])
	}
	if months, ok := raw["months"].([]any); !ok || len(months) != 6 {
		t.Errorf("expected six zero months, got %v", raw["months"])
	}
	if raw["total"] != "0" {
		t.Errorf("expected total \"0\", got %v", raw["total"])
	}
	if raw["unhealthyTotal"] != "0" {
		t.Errorf("expected unhealthyTotal \"0\", got %v", raw["unhealthyTotal"])
	}
}

func TestGroupOverviewDefaultsToTheCurrentMonth(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	w := callGetGroupOverview(1, "1", "")
	assertStatus(t, w, http.StatusOK)

	expected := time.Now().In(repositories.GetAppLocation()).Format("2006-01")
	if overview := decodeGroupOverview(t, w); overview.Month != expected {
		t.Errorf("expected the current month %s, got %s", expected, overview.Month)
	}
}

func TestGroupOverviewRejectsAMalformedMonth(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	grantAllGroupPerms(t, 1, 1)

	for _, month := range []string{"2026-13", "October", "2026-10-01"} {
		w := callGetGroupOverview(1, "1", month)
		assertStatus(t, w, http.StatusBadRequest)
	}
}

func TestGroupOverviewRequiresReceiptsRead(t *testing.T) {
	defer tearDownGroupOverviewTest()
	repositories.CreateTestGroupWithUsers()
	// User 1 is a member of group 1 without any role; user 4 is not a member of group 1 at all.

	assertStatus(t, callGetGroupOverview(1, "1", "2026-10"), http.StatusForbidden)

	grantAllGroupPerms(t, 4, 2)
	assertStatus(t, callGetGroupOverview(4, "1", "2026-10"), http.StatusForbidden)
}
