package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

// The role list is permission-gated (app.roles.read). adminContext returns claims
// for user 2 and ensures that user actually holds the permission in the database
// (the JWT itself is never trusted). userContext returns claims for a different
// user that holds no role, so "due to role" cases are rejected with 403.
func adminContext() *validator.ValidatedClaims {
	ensureRoleAdmin(2)
	return &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 2}}
}

func userContext() *validator.ValidatedClaims {
	return &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 3}}
}

// ensureRoleAdmin idempotently gives userId an app role holding app.roles.read,
// so the role list authorizes the user. It creates a single reusable "Role
// Admin" role within the test's (truncated) database.
func ensureRoleAdmin(userId uint) {
	services.ClearRolePermissionCacheForTests()
	db := repositories.GetDB()

	var role models.AppRole
	if err := db.Where("name = ?", "Role Admin").First(&role).Error; err != nil {
		roleRepository := repositories.NewRoleRepository(nil)
		created, cErr := roleRepository.CreateAppRole("Role Admin", "", []string{permissions.AppRolesRead})
		if cErr != nil {
			panic(cErr)
		}
		role = created
	}

	var count int64
	db.Model(&models.User{}).Where("id = ?", userId).Count(&count)
	if count == 0 {
		db.Create(&models.User{BaseModel: models.BaseModel{ID: userId}, Username: "role-admin", Password: "password", AppRoleID: &role.ID})
	} else {
		db.Model(&models.User{}).Where("id = ?", userId).Update("app_role_id", role.ID)
	}
}

func getRolesAs(claims *validator.ValidatedClaims) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api", strings.NewReader(""))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claims))

	GetRoles(w, r)
	return w
}

// The list carries the four fixed roles as the people pages read them: an id to assign, a scope, the
// permission keys, and nothing of the grants a role once had.
func TestShouldGetRoles(t *testing.T) {
	defer repositories.TruncateTestDb()
	if err := repositories.SeedSystemRoles(); err != nil {
		t.Fatal(err)
	}

	w := getRolesAs(adminContext())
	if w.Result().StatusCode != 200 {
		utils.PrintTestError(t, w.Result().StatusCode, 200)
		return
	}

	roles := make([]structs.RoleView, 0)
	if err := json.Unmarshal(w.Body.Bytes(), &roles); err != nil {
		utils.PrintTestError(t, err, nil)
		return
	}

	// The four fixed roles, and the "Role Admin" role adminContext makes to authorize this request.
	scopes := map[string]permissions.Scope{}
	for _, role := range roles {
		scopes[role.Name] = role.Scope
	}
	expected := map[string]permissions.Scope{
		repositories.LegacyAdminRoleName:  permissions.ScopeApp,
		repositories.FamilyUserRoleName:   permissions.ScopeApp,
		repositories.LegacyOwnerRoleName:  permissions.ScopeGroup,
		repositories.FamilyMemberRoleName: permissions.ScopeGroup,
		"Role Admin":                      permissions.ScopeApp,
	}
	if len(scopes) != len(expected) {
		utils.PrintTestError(t, scopes, expected)
	}
	for name, scope := range expected {
		if scopes[name] != scope {
			utils.PrintTestError(t, scopes[name], scope)
		}
	}

	var raw []map[string]json.RawMessage
	if err := json.Unmarshal(w.Body.Bytes(), &raw); err != nil {
		t.Fatal(err)
	}
	for _, gone := range []string{"categoryGrants", "tagGrants", "paidByUserGrants", "reportTemplateGrants", "seesAllMembers", "requireReceiptComment"} {
		if _, present := raw[0][gone]; present {
			utils.PrintTestError(t, gone+" is in the answer", "absent")
		}
	}
}

func TestShouldNotGetRolesDueToRole(t *testing.T) {
	defer repositories.TruncateTestDb()

	w := getRolesAs(userContext())
	if w.Result().StatusCode != 403 {
		utils.PrintTestError(t, w.Result().StatusCode, 403)
	}
}
