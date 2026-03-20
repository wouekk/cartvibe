package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

func tearDownUserTest() {
	repositories.TruncateTestDb()
}

func TestShouldNotAllowUserToDeleteUser(t *testing.T) {
	defer tearDownUserTest()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api", reader)
	var expectedStatusCode = http.StatusForbidden

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "3")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1, UserRole: models.USER}},
		)
	r = r.WithContext(newContext)

	DeleteUser(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldNotAllowUserToResetPassword(t *testing.T) {
	defer tearDownUserTest()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api", reader)
	var expectedStatusCode = http.StatusForbidden

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1, UserRole: models.USER}},
		)
	r = r.WithContext(newContext)

	ResetPassword(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldNotAllowUserToConvertUser(t *testing.T) {
	defer tearDownUserTest()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api", reader)
	var expectedStatusCode = http.StatusForbidden

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1, UserRole: models.USER}},
		)
	r = r.WithContext(newContext)

	ConvertDummyUserToNormalUser(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldNotAllowUserToCreateUser(t *testing.T) {
	defer tearDownUserTest()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api", reader)
	var expectedStatusCode = http.StatusForbidden

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1, UserRole: models.USER}},
		)
	r = r.WithContext(newContext)

	CreateUser(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldNotAllowUserToUpdateUser(t *testing.T) {
	defer tearDownUserTest()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api", reader)
	var expectedStatusCode = http.StatusForbidden

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1, UserRole: models.USER}},
		)
	r = r.WithContext(newContext)

	UpdateUser(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func createTestUser(t *testing.T, username string, password string, role models.UserRole) models.User {
	userRepository := repositories.NewUserRepository(nil)
	user, err := userRepository.CreateUser(commands.SignUpCommand{
		Username:    username,
		DisplayName: username,
		Password:    password,
	})
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	if role != "" {
		db := repositories.GetDB()
		db.Model(&models.User{}).Where("id = ?", user.ID).Update("user_role", role)
		user.UserRole = role
	}

	return user
}

func TestDeleteAccountShouldFailWithWrongPassword(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	user := createTestUser(t, "testuser", "correctpassword", models.USER)

	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/user/deleteAccount", reader)

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", commands.DeleteAccountCommand{Password: "wrongpassword"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: user.ID, UserRole: models.USER},
	})
	r = r.WithContext(ctx)

	DeleteAccount(w, r)

	if w.Result().StatusCode != http.StatusUnauthorized {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusUnauthorized)
	}
}

func TestDeleteAccountShouldSucceedWithCorrectPassword(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	// Create a second admin so this user is not the only admin
	createTestUser(t, "adminuser", "adminpass", models.ADMIN)
	user := createTestUser(t, "testuser", "correctpassword", models.USER)

	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/user/deleteAccount", reader)

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", commands.DeleteAccountCommand{Password: "correctpassword"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: user.ID, UserRole: models.USER},
	})
	r = r.WithContext(ctx)

	DeleteAccount(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
	}

	// Verify user was deleted
	var count int64
	db.Model(&models.User{}).Where("id = ?", user.ID).Count(&count)
	if count != 0 {
		utils.PrintTestError(t, count, 0)
	}
}

func TestDeleteAccountShouldPreventLastAdminDeletion(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()
	db.Create(&models.SystemEmail{})

	// This user will be the only admin (first user created gets ADMIN role)
	user := createTestUser(t, "onlyadmin", "adminpassword", models.ADMIN)

	// Ensure no other admins exist
	var adminCount int64
	db.Model(&models.User{}).Where("user_role = ?", models.ADMIN).Count(&adminCount)
	if adminCount != 1 {
		t.Fatalf("Expected exactly 1 admin, got %d", adminCount)
	}

	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/user/deleteAccount", reader)

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", commands.DeleteAccountCommand{Password: "adminpassword"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: user.ID, UserRole: models.ADMIN},
	})
	r = r.WithContext(ctx)

	DeleteAccount(w, r)

	if w.Result().StatusCode != http.StatusBadRequest {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusBadRequest)
	}

	// Verify user was NOT deleted
	var count int64
	db.Model(&models.User{}).Where("id = ?", user.ID).Count(&count)
	if count != 1 {
		utils.PrintTestError(t, count, 1)
	}
}
