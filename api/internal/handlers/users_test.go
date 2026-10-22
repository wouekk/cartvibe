package handlers

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/shopspring/decimal"

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


	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "3")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}},
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


	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}},
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


	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}},
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


	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}},
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


	newContext := context.
		WithValue(
			r.Context(),
			jwtmiddleware.ContextKey{},
			&validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}},
		)
	r = r.WithContext(newContext)

	UpdateUser(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func createTestUser(t *testing.T, username string, password string) models.User {
	userRepository := repositories.NewUserRepository(nil)
	user, err := userRepository.CreateUser(commands.SignUpCommand{
		Username:    username,
		DisplayName: username,
		Password:    password,
	})
	if err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	return user
}

func TestDeleteAccountShouldFailWithWrongPassword(t *testing.T) {
	defer tearDownUserTest()


	user := createTestUser(t, "testuser", "correctpassword")

	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/user/deleteAccount", reader)

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", commands.DeleteAccountCommand{Password: "wrongpassword"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: user.ID, AuthSource: structs.AuthSourceJwt},
	})
	r = r.WithContext(ctx)

	grantAppPerms(t, user.ID, permissions.AppAccountDelete)

	DeleteAccount(w, r)

	if w.Result().StatusCode != http.StatusUnauthorized {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusUnauthorized)
	}
}

func TestDeleteAccountShouldSucceedWithCorrectPassword(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()

	// Create a second admin so this user is not the only admin
	adminUser := createTestUser(t, "adminuser", "adminpass")
	grantAppPerms(t, adminUser.ID, permissions.AppUsersRead)
	user := createTestUser(t, "testuser", "correctpassword")

	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/user/deleteAccount", reader)

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", commands.DeleteAccountCommand{Password: "correctpassword"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: user.ID, AuthSource: structs.AuthSourceJwt},
	})
	r = r.WithContext(ctx)

	grantAppPerms(t, user.ID, permissions.AppAccountDelete)

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

	// This user will be the only admin. "Administrator" is defined by the
	// modern app.users.read permission (see services.DeleteAccount), so grant
	// it the admin permission alongside the self-service delete permission.
	user := createTestUser(t, "onlyadmin", "adminpassword")
	grantAppPerms(t, user.ID, permissions.AppUsersRead, permissions.AppAccountDelete)

	// Ensure no other admins exist
	roleRepository := repositories.NewRoleRepository(nil)
	adminCount, err := roleRepository.CountUsersWithAppPermission(permissions.AppUsersRead)
	if err != nil {
		t.Fatalf("count admins: %v", err)
	}
	if adminCount != 1 {
		t.Fatalf("Expected exactly 1 admin, got %d", adminCount)
	}

	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/user/deleteAccount", reader)

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", commands.DeleteAccountCommand{Password: "adminpassword"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: user.ID, AuthSource: structs.AuthSourceJwt},
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

// deleteAccountAs drives POST /user/deleteAccount with claims built the way the
// named auth source would have built them.
func deleteAccountAs(t *testing.T, userId uint, password string, authSource string) *httptest.ResponseRecorder {
	t.Helper()

	return deleteAccountWithCommandAs(t, userId, commands.DeleteAccountCommand{Password: password}, authSource)
}

// deleteAccountWithCommandAs is deleteAccountAs for any command body.
func deleteAccountWithCommandAs(t *testing.T, userId uint, command commands.DeleteAccountCommand, authSource string) *httptest.ResponseRecorder {
	t.Helper()

	r := httptest.NewRequest("POST", "/api/user/deleteAccount", strings.NewReader(""))

	ctx := context.WithValue(r.Context(), "deleteAccountCommand", command)
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: userId, AuthSource: authSource},
	})

	w := httptest.NewRecorder()
	DeleteAccount(w, r.WithContext(ctx))

	return w
}

// TestDeleteAccountRequiresAnInteractiveSession pins self-delete to the account's
// own session. A key must not be able to destroy the account that issued it,
// whatever its scope -- the same rule connecting and disconnecting an identity
// provider carry.
func TestDeleteAccountRequiresAnInteractiveSession(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()

	// A second admin, so the last-admin guard cannot be what refuses the delete.
	adminUser := createTestUser(t, "adminuser", "adminpass")
	grantAppPerms(t, adminUser.ID, permissions.AppUsersRead)
	user := createTestUser(t, "testuser", "correctpassword")
	grantAppPerms(t, user.ID, permissions.AppAccountDelete)

	// Unmarked claims are denied too: the check requires an interactive session
	// rather than rejecting a key, so the zero value cannot slip through.
	for _, authSource := range []string{structs.AuthSourceApiKey, ""} {
		w := deleteAccountAs(t, user.ID, "correctpassword", authSource)
		if w.Result().StatusCode != http.StatusForbidden {
			t.Errorf("auth source %q: expected 403, got %d", authSource, w.Result().StatusCode)
		}
	}

	var count int64
	db.Model(&models.User{}).Where("id = ?", user.ID).Count(&count)
	if count != 1 {
		t.Fatalf("a refused self-delete removed the account anyway")
	}

	// The positive control: the same call from a real session succeeds, so the
	// 403s above are the credential rule and not some unrelated failure.
	w := deleteAccountAs(t, user.ID, "correctpassword", structs.AuthSourceJwt)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected an interactive session to delete the account, got %d", w.Result().StatusCode)
	}
}

// An OIDC-only account deletes itself through this same endpoint, presenting the
// code its provider sign-in produced in place of a password it does not have. A
// key still cannot, code or not.
func TestDeleteAccountWithAConfirmationCode(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()

	user := createTestUser(t, "oidconly", "a-password-nobody-knows")
	grantAppPerms(t, user.ID, permissions.AppAccountDelete)

	provider := models.OidcProvider{
		Name:         "keycloak",
		DisplayName:  "Keycloak",
		IssuerUrl:    "https://idp.example.com",
		ClientId:     "client",
		ClientSecret: "secret",
		Enabled:      true,
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("failed to create the provider: %v", err)
	}

	identity := models.OidcIdentity{OidcProviderId: provider.ID, Subject: "a-subject", UserId: user.ID, ProvisionedUser: true}
	if err := db.Create(&identity).Error; err != nil {
		t.Fatalf("failed to create the identity: %v", err)
	}

	confirmation := models.OidcDeleteConfirmation{
		CodeHash:  utils.Sha256Hash([]byte("a-code")),
		UserId:    user.ID,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}
	if err := db.Create(&confirmation).Error; err != nil {
		t.Fatalf("failed to create the confirmation: %v", err)
	}

	command := commands.DeleteAccountCommand{ConfirmationCode: "a-code"}

	refused := deleteAccountWithCommandAs(t, user.ID, command, structs.AuthSourceApiKey)
	if refused.Result().StatusCode != http.StatusForbidden {
		t.Fatalf("expected an API key to be refused, got %d", refused.Result().StatusCode)
	}

	w := deleteAccountWithCommandAs(t, user.ID, command, structs.AuthSourceJwt)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected the confirmed delete to succeed, got %d (%s)", w.Result().StatusCode, w.Body.String())
	}

	var count int64
	db.Model(&models.User{}).Where("id = ?", user.ID).Count(&count)
	if count != 0 {
		t.Fatalf("expected the account to be deleted")
	}
}

// ---------------------------------------------------------------------------
// GetAmountOwedForUser tests
// ---------------------------------------------------------------------------

func setupAmountOwedTest(t *testing.T) {
	repositories.CreateTestGroupWithUsers()
	// GetAmountOwedForUser is gated on group.receipts.read; authorize user 1 in
	// group 1 (the group the positive cases query).
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead)
}

func assertOwed(t *testing.T, result map[uint]decimal.Decimal, otherUserId uint, expected float64) {
	t.Helper()
	exp := decimal.NewFromFloat(expected)
	got, ok := result[otherUserId]
	if !ok {
		t.Errorf("expected entry for user %d (=%s) but none found; result=%v", otherUserId, exp.String(), result)
		return
	}
	if !got.Equal(exp) {
		t.Errorf("expected resultMap[%d] == %s, got %s", otherUserId, exp.String(), got.String())
	}
}

// setupIsolatedAmountOwedTest seeds group 1 as an isolated group where user 1 is
// the (restricted) caller, user 3 is a visible supervisor, and user 2 is an
// invisible peer.
func setupIsolatedAmountOwedTest(t *testing.T) {
	repositories.CreateTestGroupWithUsers()
	grantGroupPerms(t, 1, 1, permissions.GroupReceiptsRead)
	isolateGroupWithSupervisor(t, 1, 3)
}

// --- Member isolation ---------------------------------------------------

// --- A. Authorization ---------------------------------------------------

// --- B. Empty / baseline ------------------------------------------------

// --- C. Basic positive (single receipt) ---------------------------------

// --- D. Multi-user / multi-receipt aggregation --------------------------

// --- E. Negative (refund) coverage --------------------------------------

// --- F. Zero amount -----------------------------------------------------

// --- G. Status filter ---------------------------------------------------

// --- H. All-group expansion --------------------------------------------

// --- I. receiptIds parameter -------------------------------------------

func TestShouldNotAllowUserToGetPagedUsers(t *testing.T) {
	defer tearDownUserTest()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	GetPagedUsers(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldNotGetPagedUsersWithBadRequest(t *testing.T) {
	defer tearDownUserTest()

	tests := map[string]struct {
		input  commands.PagedRequestCommand
		expect int
	}{
		"badOrderBy": {
			input:  commands.PagedRequestCommand{Page: 1, PageSize: 50, OrderBy: "badOrderBy", SortDirection: "asc"},
			expect: http.StatusInternalServerError,
		},
		"badSortDirection": {
			input:  commands.PagedRequestCommand{Page: 1, PageSize: 50, OrderBy: "username", SortDirection: "badSortDirection"},
			expect: http.StatusBadRequest,
		},
		"badPage": {
			input:  commands.PagedRequestCommand{Page: -1, PageSize: 50, OrderBy: "username", SortDirection: "asc"},
			expect: http.StatusBadRequest,
		},
		"badPageSize": {
			input:  commands.PagedRequestCommand{Page: 1, PageSize: -2, OrderBy: "username", SortDirection: "asc"},
			expect: http.StatusBadRequest,
		},
		"valid": {
			input:  commands.PagedRequestCommand{Page: 1, PageSize: 25, OrderBy: "username", SortDirection: "asc"},
			expect: http.StatusOK,
		},
	}

	grantAllAppPerms(t, 1)

	for name, test := range tests {
		bytes, _ := json.Marshal(test.input)
		reader := strings.NewReader(string(bytes))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api", reader)

		newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
		r = r.WithContext(newContext)

		GetPagedUsers(w, r)

		if w.Result().StatusCode != test.expect {
			utils.PrintTestError(t, name+" status "+strconv.Itoa(w.Result().StatusCode), test.expect)
		}
	}
}

func TestShouldAllowAdminToGetPagedUsers(t *testing.T) {
	defer tearDownUserTest()

	// grantAllAppPerms creates user 1 with the admin role; add two more so the
	// page returns a known, non-trivial set.
	grantAllAppPerms(t, 1)
	db := repositories.GetDB()
	db.Create(&models.User{Username: "alpha", DisplayName: "alpha", Password: "password"})
	db.Create(&models.User{Username: "beta", DisplayName: "beta", Password: "password"})

	command := commands.PagedRequestCommand{Page: 1, PageSize: 25, OrderBy: "username", SortDirection: "asc"}
	bytes, _ := json.Marshal(command)
	reader := strings.NewReader(string(bytes))
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	GetPagedUsers(w, r)

	if w.Result().StatusCode != http.StatusOK {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusOK)
		return
	}

	var pagedData structs.PagedData
	if err := json.NewDecoder(w.Result().Body).Decode(&pagedData); err != nil {
		utils.PrintTestError(t, err, "no error decoding paged data")
		return
	}

	if pagedData.TotalCount != 3 {
		utils.PrintTestError(t, pagedData.TotalCount, int64(3))
	}
	if len(pagedData.Data) != 3 {
		utils.PrintTestError(t, len(pagedData.Data), 3)
	}
}

// TestResetPasswordClearsTheOidcProvisionedFlag pins the wiring behind the
// lockout guard's own advice.
//
// An account created by an OIDC provisioning login holds only a random,
// discarded password, so unlinking its last provider is refused with "ask an
// administrator to set one before disconnecting". That advice was a dead end:
// the administrator could comply and the unlink stayed refused, because nothing
// observed the reset. This is the observation.
func TestResetPasswordClearsTheOidcProvisionedFlag(t *testing.T) {
	defer tearDownUserTest()

	db := repositories.GetDB()

	provisioned := models.User{Username: "provisioned-user", Password: "unusable"}
	if err := db.Create(&provisioned).Error; err != nil {
		t.Fatalf("failed to create the user: %v", err)
	}

	provider := models.OidcProvider{
		Name:        "resetidp",
		DisplayName: "Reset IdP",
		IssuerUrl:   "https://idp.example.com",
		ClientId:    "client",
		Scope:       "openid",
	}
	if err := db.Create(&provider).Error; err != nil {
		t.Fatalf("failed to create the provider: %v", err)
	}

	identity := models.OidcIdentity{
		Subject:         "reset-subject",
		OidcProviderId:  provider.ID,
		UserId:          provisioned.ID,
		ProvisionedUser: true,
	}
	if err := db.Create(&identity).Error; err != nil {
		t.Fatalf("failed to create the identity: %v", err)
	}

	admin := uint(9001)
	grantAppPerms(t, admin, permissions.AppUsersUpdate)

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/user/"+strconv.Itoa(int(provisioned.ID))+"/resetPassword", strings.NewReader(""))

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", strconv.Itoa(int(provisioned.ID)))
	ctx := context.WithValue(request.Context(), chi.RouteCtxKey, chiContext)
	ctx = context.WithValue(ctx, "reset_password", structs.ResetPasswordCommand{Password: "a-real-password"})
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{
		CustomClaims: &structs.Claims{UserId: admin},
	})

	ResetPassword(recorder, request.WithContext(ctx))

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d (%s)", recorder.Code, recorder.Body.String())
	}

	var refreshed models.OidcIdentity
	if err := db.First(&refreshed, identity.ID).Error; err != nil {
		t.Fatalf("failed to reload the identity: %v", err)
	}

	if refreshed.ProvisionedUser {
		t.Error("setting a password must clear the provisioned flag, or the unlink stays refused forever")
	}
}
