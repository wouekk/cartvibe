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
