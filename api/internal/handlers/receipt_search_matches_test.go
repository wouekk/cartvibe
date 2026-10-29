package handlers

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
)

func searchReceiptsBody(t *testing.T, phrase string) string {
	body, err := json.Marshal(commands.ReceiptPagedRequestCommand{
		PagedRequestCommand: commands.PagedRequestCommand{Page: 1, PageSize: 10},
		Filter:              commands.ReceiptPagedRequestFilter{Search: phrase},
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
		return ""
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/receipt/group/1", strings.NewReader(string(body)))
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("groupId", "1")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}}))

	GetPagedReceiptsForGroup(w, r)

	if w.Result().StatusCode != 200 {
		utils.PrintTestError(t, w.Result().StatusCode, 200)
	}

	return w.Body.String()
}

func TestPagedReceiptsSearchNamesTheMatchingProductLines(t *testing.T) {
	defer tearDownReceiptsTest()
	setupReceiptsTest()

	db := repositories.GetDB()
	receipt := models.Receipt{
		Name: "Weekly shop", Amount: decimal.NewFromFloat(10), Date: time.Now(),
		PaidByUserID: 1, GroupId: 1, Status: models.OPEN,
	}
	db.Create(&receipt)
	other := models.Receipt{
		Name: "Bakery", Amount: decimal.NewFromFloat(3), Date: time.Now(),
		PaidByUserID: 1, GroupId: 1, Status: models.OPEN,
	}
	db.Create(&other)

	price := decimal.RequireFromString("2.49")
	db.Create(&models.ReceiptProduct{ReceiptId: receipt.ID, Name: "CHOC NOIR 70%", DisplayName: "Dark chocolate", Amount: &price})

	grantAllGroupPerms(t, 1, 1)
	searched := searchReceiptsBody(t, "chocolate")
	if !strings.Contains(searched, `"searchMatches":[{"name":"Dark chocolate","amount":"2.49"}]`) {
		utils.PrintTestError(t, searched, "searchMatches with the dark chocolate line")
	}
	if strings.Contains(searched, "Bakery") {
		utils.PrintTestError(t, searched, "only the matching receipt")
	}

	plain := searchReceiptsBody(t, "")
	if strings.Contains(plain, "searchMatches") {
		utils.PrintTestError(t, plain, "no searchMatches key without a search")
	}
	if !strings.Contains(plain, "Bakery") {
		utils.PrintTestError(t, plain, "every receipt without a search")
	}
}

// The Warranties list gets each receipt's product names in the order printed (plain name, else as printed);
// other lists do not.
func TestPagedReceiptsListTheProductsOfWarranties(t *testing.T) {
	defer tearDownReceiptsTest()
	setupReceiptsTest()

	db := repositories.GetDB()
	until := time.Now().AddDate(1, 0, 0).Format(time.DateOnly)
	receipt := models.Receipt{
		Name: "Apple", ShopName: "Apple", Amount: decimal.NewFromFloat(1428), Date: time.Now(),
		PaidByUserID: 1, GroupId: 1, Status: models.OPEN, WarrantyUntil: &until,
	}
	db.Create(&receipt)
	db.Create(&models.ReceiptProduct{ReceiptId: receipt.ID, Position: 1, Name: "USB-C CABLE 2M", DisplayName: ""})
	db.Create(&models.ReceiptProduct{ReceiptId: receipt.ID, Position: 0, Name: "MBA13.6 MDN", DisplayName: "Apple MacBook Air 13.6"})
	grantAllGroupPerms(t, 1, 1)

	list := func(filter commands.ReceiptPagedRequestFilter) []map[string]any {
		body, _ := json.Marshal(commands.ReceiptPagedRequestCommand{
			PagedRequestCommand: commands.PagedRequestCommand{Page: 1, PageSize: 10, OrderBy: "warranty_until", SortDirection: commands.ASCENDING},
			Filter:              filter,
		})
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api/receipt/group/1", strings.NewReader(string(body)))
		rctx := chi.NewRouteContext()
		rctx.URLParams.Add("groupId", "1")
		r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
		r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}}))
		GetPagedReceiptsForGroup(w, r)
		if w.Result().StatusCode != 200 {
			t.Fatalf("status %d: %s", w.Result().StatusCode, w.Body.String())
		}
		var page struct {
			Data []map[string]any `json:"data"`
		}
		if err := json.Unmarshal(w.Body.Bytes(), &page); err != nil {
			t.Fatal(err)
		}
		return page.Data
	}

	warranties := list(commands.ReceiptPagedRequestFilter{WarrantyActive: true})
	if len(warranties) != 1 {
		t.Fatalf("expected the one warranty, got %d", len(warranties))
	}
	got, _ := json.Marshal(warranties[0]["warrantyProducts"])
	if string(got) != `["Apple MacBook Air 13.6","USB-C CABLE 2M"]` {
		t.Errorf("unexpected warranty products %s", got)
	}

	plain := list(commands.ReceiptPagedRequestFilter{})
	if _, present := plain[0]["warrantyProducts"]; present {
		t.Errorf("an ordinary list should not carry warranty products")
	}
}
