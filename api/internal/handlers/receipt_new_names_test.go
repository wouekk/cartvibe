package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"
)

func claimsForUser(userId uint) *validator.ValidatedClaims {
	return &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}}
}

// seedReceiptWriter creates a household plus a member who may create, read and update its receipts and
// holds no app role (so no app.categories.create or app.tags.create), and returns the user id and group id.
func seedReceiptWriter(t *testing.T) (uint, uint) {
	t.Helper()
	services.ClearRolePermissionCacheForTests()
	db := repositories.GetDB()

	group := models.Group{Name: "receipt-writer-group"}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}

	role, err := repositories.NewRoleRepository(nil).CreateGroupRole(
		"Receipt Writer",
		"",
		[]string{permissions.GroupReceiptsCreate, permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate},
	)
	if err != nil {
		t.Fatalf("seed group role: %v", err)
	}

	user := models.User{Username: "receipt-writer", Password: "password"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}

	member := models.GroupMember{GroupID: group.ID, UserID: user.ID, GroupRoleID: &role.ID}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("seed member: %v", err)
	}

	return user.ID, group.ID
}

func createReceiptAs(userId uint, body string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", strings.NewReader(body))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(userId)))

	CreateReceipt(w, r)
	return w
}

// A category sent by name creates a row in the shared catalog, so it needs app.categories.create.
func TestCreateReceiptDeniedForNewCategoryWithoutCreatePermission(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId, groupId := seedReceiptWriter(t)

	body := fmt.Sprintf(
		`{"name":"R","amount":"5","date":"2024-01-01T00:00:00Z","groupId":%d,"paidByUserId":%d,"status":"OPEN","categories":[{"name":"Brand New"}]}`,
		groupId, userId,
	)
	w := createReceiptAs(userId, body)

	if w.Result().StatusCode != 403 {
		utils.PrintTestError(t, w.Result().StatusCode, 403)
	}
}

func TestCreateReceiptDeniedForNewTagWithoutCreatePermission(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId, groupId := seedReceiptWriter(t)

	body := fmt.Sprintf(
		`{"name":"R","amount":"5","date":"2024-01-01T00:00:00Z","groupId":%d,"paidByUserId":%d,"status":"OPEN","tags":[{"name":"Brand New"}]}`,
		groupId, userId,
	)
	w := createReceiptAs(userId, body)

	if w.Result().StatusCode != 403 {
		utils.PrintTestError(t, w.Result().StatusCode, 403)
	}
}

func TestCreateReceiptAllowedForNewCategoryWithCreatePermission(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId, groupId := seedReceiptWriter(t)
	grantAppPerms(t, userId, permissions.AppCategoriesCreate)

	body := fmt.Sprintf(
		`{"name":"R","amount":"5","date":"2024-01-01T00:00:00Z","groupId":%d,"paidByUserId":%d,"status":"OPEN","categories":[{"name":"Brand New"}]}`,
		groupId, userId,
	)
	w := createReceiptAs(userId, body)

	if w.Result().StatusCode != 200 {
		utils.PrintTestError(t, w.Result().StatusCode, 200)
	}
}

// Every existing category may be picked by anyone who may write the receipt: there are no per-role or
// per-member category grants any more.
func TestCreateReceiptAllowedForAnyExistingCategory(t *testing.T) {
	defer repositories.TruncateTestDb()

	category := models.Category{Name: "Salary"}
	repositories.GetDB().Create(&category)

	userId, groupId := seedReceiptWriter(t)

	body := fmt.Sprintf(
		`{"name":"R","amount":"5","date":"2024-01-01T00:00:00Z","groupId":%d,"paidByUserId":%d,"status":"OPEN","categories":[{"id":%d,"name":"Salary"}]}`,
		groupId, userId, category.ID,
	)
	w := createReceiptAs(userId, body)

	if w.Result().StatusCode != 200 {
		utils.PrintTestError(t, w.Result().StatusCode, 200)
	}
}

// seedReceipt creates a persisted receipt in groupId and returns its id.
func seedReceipt(t *testing.T, groupId uint, paidByUserId uint) uint {
	t.Helper()
	receipt := models.Receipt{
		Name:         "Existing",
		Amount:       decimal.NewFromInt(5),
		Date:         time.Now(),
		GroupId:      groupId,
		PaidByUserID: paidByUserId,
		Status:       models.OPEN,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt.ID
}

// updateReceiptRequest builds an UpdateReceipt request for receiptId acting as
// userId, with the given JSON body.
func updateReceiptRequest(receiptId uint, userId uint, body string) (*httptest.ResponseRecorder, *http.Request) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api", strings.NewReader(body))

	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", utils.UintToString(receiptId))
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, rctx))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(userId)))

	return w, r
}
