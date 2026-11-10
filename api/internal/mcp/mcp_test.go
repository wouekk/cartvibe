package mcp

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/services"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/auth"
	"github.com/shopspring/decimal"
	"gorm.io/gorm/clause"
)

func TestNewHandlerRejectsMissingToken(t *testing.T) {
	handler := NewHandler()

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/mcp", nil))

	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without a bearer token, got %d", recorder.Code)
	}

	wwwAuth := recorder.Header().Get("WWW-Authenticate")
	if !strings.Contains(wwwAuth, "resource_metadata") {
		t.Errorf("expected WWW-Authenticate to advertise resource_metadata, got %q", wwwAuth)
	}
}

// testMcpAudience is a fixed MCP resource audience for direct verifyToken
// tests, decoupled from whatever public URL System Settings resolves to.
const testMcpAudience = "https://receipts.example.com/mcp"

func TestVerifyTokenAcceptsValidJwt(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "tokenuser")
	accessToken, _, _, err := services.GenerateMcpJWT(user.ID, testMcpAudience)
	if err != nil {
		t.Fatalf("failed to generate jwt: %v", err)
	}

	info, err := verifyToken(context.Background(), testMcpAudience, accessToken)
	if err != nil {
		t.Fatalf("verifyToken rejected a valid token: %v", err)
	}
	if info.UserID != utils.UintToString(user.ID) {
		t.Errorf("token UserID = %q, want %q", info.UserID, utils.UintToString(user.ID))
	}
	if _, ok := info.Extra[claimsKey]; !ok {
		t.Errorf("expected verified claims to be stored on the token info")
	}
}

// TestVerifyTokenRejectsNonMcpAudience proves an MCP token is bound to the MCP
// audience: a normal REST token (and any other audience) is rejected.
func TestVerifyTokenRejectsNonMcpAudience(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "restuser")
	restToken, _, _, err := services.GenerateJWT(user.ID)
	if err != nil {
		t.Fatalf("failed to generate jwt: %v", err)
	}

	if _, err := verifyToken(context.Background(), testMcpAudience, restToken); err == nil {
		t.Fatalf("expected a normal REST token to be rejected by the MCP validator")
	}
}

func TestHandlerAcceptsIssuedToken(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "bearer")
	// The handler reads the audience live from System Settings, so mint with
	// the same resolved resource URL it will validate against.
	accessToken, _, _, err := services.GenerateMcpJWT(user.ID, services.GetMcpResourceUrl())
	if err != nil {
		t.Fatalf("failed to generate jwt: %v", err)
	}

	handler := NewHandler()
	request := httptest.NewRequest(http.MethodGet, "/mcp", nil)
	request.Header.Set("Authorization", "Bearer "+accessToken)

	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	// A valid token must clear the auth layer. The transport may then reject a
	// bare GET for protocol reasons, but it must not be a 401.
	if recorder.Code == http.StatusUnauthorized {
		t.Fatalf("a valid issued token was rejected by the mcp auth layer")
	}
}

func TestVerifyTokenRejectsInvalidJwt(t *testing.T) {
	_, err := verifyToken(context.Background(), testMcpAudience, "not-a-real-token")
	if err == nil {
		t.Fatalf("expected an error for an invalid token")
	}
	if !strings.Contains(err.Error(), auth.ErrInvalidToken.Error()) {
		t.Errorf("expected error to wrap ErrInvalidToken, got %v", err)
	}
}

func createReceiptInGroup(t *testing.T, name string, groupId uint, paidByUserId uint) models.Receipt {
	t.Helper()
	receipt := models.Receipt{
		Name:         name,
		Amount:       decimal.NewFromInt(10),
		Date:         time.Now(),
		Status:       models.OPEN,
		GroupId:      groupId,
		PaidByUserID: paidByUserId,
	}
	if err := repositories.GetDB().Omit(clause.Associations).Create(&receipt).Error; err != nil {
		t.Fatalf("failed to create receipt: %v", err)
	}
	return receipt
}

// addGroupMember creates a group role with the given permissions, then assigns
// the user to the group with it.
func addGroupMember(t *testing.T, userId uint, groupId uint, perms []string) {
	t.Helper()
	role, err := repositories.NewRoleRepository(nil).CreateGroupRole("mcp-test-role", "", perms)
	if err != nil {
		t.Fatalf("failed to create group role: %v", err)
	}
	member := models.GroupMember{UserID: userId, GroupID: groupId, GroupRoleID: &role.ID}
	if err := repositories.GetDB().Create(&member).Error; err != nil {
		t.Fatalf("failed to create group member: %v", err)
	}
	// The permission/grant resolution caches are keyed by role id, which the
	// test DB can reuse across truncations — clear them so the freshly created
	// role's permissions are resolved from the DB rather than a stale entry.
	services.ClearRolePermissionCacheForTests()
}

// setAppRole creates an app role with the given permissions and assigns it to the
// user, so app-scoped checks (e.g. app.receipts.search, app.categories.read)
// resolve to it.
func setAppRole(t *testing.T, userId uint, roleName string, perms []string) {
	t.Helper()
	role, err := repositories.NewRoleRepository(nil).CreateAppRole(roleName, "", perms)
	if err != nil {
		t.Fatalf("failed to create app role: %v", err)
	}
	if err := repositories.GetDB().Model(&models.User{}).Where("id = ?", userId).
		Update("app_role_id", role.ID).Error; err != nil {
		t.Fatalf("failed to assign app role: %v", err)
	}
	services.ClearRolePermissionCacheForTests()
}

func listCategories(t *testing.T, userId uint) []models.Category {
	t.Helper()
	_, out, err := handleListCategories(context.Background(), requestForUser(userId), emptyInput{})
	if err != nil {
		t.Fatalf("handleListCategories returned error: %v", err)
	}
	envelope, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected result envelope, got %T", out)
	}
	categories, ok := envelope["categories"].([]models.Category)
	if !ok {
		t.Fatalf("expected categories result, got %T", envelope["categories"])
	}
	return categories
}

func TestListGroupsReturnsGroupsEnvelope(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "group-member")
	group := models.Group{Name: "MCP group"}
	if err := repositories.GetDB().Create(&group).Error; err != nil {
		t.Fatalf("failed to create group: %v", err)
	}
	addGroupMember(t, user.ID, group.ID, nil)

	_, out, err := handleListGroups(context.Background(), requestForUser(user.ID), emptyInput{})
	if err != nil {
		t.Fatalf("handleListGroups returned error: %v", err)
	}
	envelope, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected result envelope, got %T", out)
	}
	groups, ok := envelope["groups"].([]models.Group)
	if !ok {
		t.Fatalf("expected groups result, got %T", envelope["groups"])
	}
	if len(groups) != 1 || groups[0].ID != group.ID {
		t.Errorf("expected the member group, got %+v", groups)
	}
}

// An app.categories.read holder (admin / category manager) sees the whole pool,
// matching the admin-only REST global list.
func TestListCategoriesAppReaderSeesAll(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "catadmin")
	repositories.CreateTestCategories()
	setAppRole(t, user.ID, "cat-reader", []string{permissions.AppCategoriesRead})

	if got := len(listCategories(t, user.ID)); got != 3 {
		t.Errorf("expected the app reader to see all 3 categories, got %d", got)
	}
}

// A member whose group role has no category grants is unrestricted (sees all).
func TestListCategoriesUnrestrictedGroupMemberSeesAll(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "catunrestricted")
	group := models.Group{Name: "g"}
	if err := repositories.GetDB().Create(&group).Error; err != nil {
		t.Fatalf("failed to create group: %v", err)
	}
	repositories.CreateTestCategories()
	addGroupMember(t, user.ID, group.ID, []string{permissions.GroupReceiptsRead})

	if got := len(listCategories(t, user.ID)); got != 3 {
		t.Errorf("expected an unrestricted member to see all 3 categories, got %d", got)
	}
}

// A user with no app read permission and no groups sees nothing — the global pool
// is not leaked, matching the REST behavior where non-admins only get per-group
// filtered catalogs.
func TestListCategoriesNoAccessSeesNone(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "catnoaccess")
	repositories.CreateTestCategories()

	if got := len(listCategories(t, user.ID)); got != 0 {
		t.Errorf("expected a user with no grants to see 0 categories, got %d", got)
	}
}

func TestGetReceiptEnforcesGroupAccess(t *testing.T) {
	defer repositories.TruncateTestDb()

	member := createUser(t, "member")
	outsider := createUser(t, "outsider")

	group := models.Group{Name: "g1"}
	if err := repositories.GetDB().Create(&group).Error; err != nil {
		t.Fatalf("failed to create group: %v", err)
	}
	addGroupMember(t, member.ID, group.ID, []string{permissions.GroupReceiptsRead})

	receipt := createReceiptInGroup(t, "Lunch", group.ID, member.ID)
	receiptId := utils.UintToString(receipt.ID)

	// A member of the group can read the receipt.
	_, out, err := handleGetReceipt(context.Background(), requestForUser(member.ID), getReceiptInput{Id: receiptId})
	if err != nil {
		t.Fatalf("group member could not read receipt: %v", err)
	}
	if got, ok := out.(models.Receipt); !ok || got.ID != receipt.ID {
		t.Errorf("expected the requested receipt to be returned")
	}

	// A non-member is denied, with an error that does not confirm existence.
	_, _, err = handleGetReceipt(context.Background(), requestForUser(outsider.ID), getReceiptInput{Id: receiptId})
	if err == nil {
		t.Fatalf("expected non-member to be denied access to the receipt")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("expected a non-leaking 'not found' error, got %v", err)
	}
}

func TestSearchReceiptsScopesToUserGroups(t *testing.T) {
	defer repositories.TruncateTestDb()

	user := createUser(t, "searcher")

	memberGroup := models.Group{Name: "mine"}
	otherGroup := models.Group{Name: "theirs"}
	if err := repositories.GetDB().Create(&memberGroup).Error; err != nil {
		t.Fatalf("failed to create member group: %v", err)
	}
	if err := repositories.GetDB().Create(&otherGroup).Error; err != nil {
		t.Fatalf("failed to create other group: %v", err)
	}
	setAppRole(t, user.ID, "searcher-role", []string{permissions.AppReceiptsSearch})
	addGroupMember(t, user.ID, memberGroup.ID, []string{permissions.GroupReceiptsRead})

	createReceiptInGroup(t, "Coffee shop", memberGroup.ID, user.ID)
	createReceiptInGroup(t, "Coffee beans", memberGroup.ID, user.ID)
	createReceiptInGroup(t, "Coffee elsewhere", otherGroup.ID, user.ID)

	_, out, err := handleSearchReceipts(context.Background(), requestForUser(user.ID), searchReceiptsInput{Query: "Coffee"})
	if err != nil {
		t.Fatalf("handleSearchReceipts returned error: %v", err)
	}

	envelope, ok := out.(map[string]any)
	if !ok {
		t.Fatalf("expected result envelope, got %T", out)
	}
	results, ok := envelope["receipts"].([]structs.SearchResult)
	if !ok {
		t.Fatalf("expected receipts result, got %T", envelope["receipts"])
	}
	if len(results) != 2 {
		t.Errorf("expected 2 receipts from the user's group, got %d", len(results))
	}
	for _, result := range results {
		if result.GroupID != memberGroup.ID {
			t.Errorf("search returned a receipt from group %d outside the user's groups", result.GroupID)
		}
	}
}

func TestSearchReceiptsRequiresSearchPermission(t *testing.T) {
	defer repositories.TruncateTestDb()

	// Group read access and a matching receipt exist, but no app role -> no
	// app.receipts.search, so the denial is specifically tied to the missing
	// search permission rather than a lack of data or membership.
	user := createUser(t, "nosearch")
	group := models.Group{Name: "g"}
	if err := repositories.GetDB().Create(&group).Error; err != nil {
		t.Fatalf("failed to create group: %v", err)
	}
	addGroupMember(t, user.ID, group.ID, []string{permissions.GroupReceiptsRead})
	createReceiptInGroup(t, "anything", group.ID, user.ID)

	_, _, err := handleSearchReceipts(context.Background(), requestForUser(user.ID), searchReceiptsInput{Query: "anything"})
	if err == nil {
		t.Fatalf("expected a user without app.receipts.search to be denied")
	}
	if !strings.Contains(err.Error(), "unauthorized") {
		t.Errorf("expected an 'unauthorized' error, got %v", err)
	}
}
