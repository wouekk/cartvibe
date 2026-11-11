package services

import (
	"errors"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"testing"
	"time"

	"github.com/shopspring/decimal"
	"gorm.io/gorm/clause"
)

// seedReceipt persists a receipt (no associations) paid by the given user.
func seedReceipt(t *testing.T, name string, groupId uint, paidByUserId uint) models.Receipt {
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
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt
}

// seedReceiptMember creates a group, a group role with the given permissions,
// and a member assigned to it. Returns the member's user id and group id.
func seedReceiptMember(t *testing.T, username string, roleName string, perms []string) (uint, uint) {
	t.Helper()
	db := repositories.GetDB()

	group := models.Group{Name: "grp-" + username}
	if err := db.Create(&group).Error; err != nil {
		t.Fatalf("seed group: %v", err)
	}

	role, err := repositories.NewRoleRepository(nil).CreateGroupRole(roleName, "", perms)
	if err != nil {
		t.Fatalf("seed group role: %v", err)
	}

	user := models.User{Username: username, Password: "password"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("seed member user: %v", err)
	}
	member := models.GroupMember{GroupID: group.ID, UserID: user.ID, GroupRoleID: &role.ID}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("seed group member: %v", err)
	}

	ClearRolePermissionCacheForTests()
	return user.ID, group.ID
}

// giveAppRole assigns an app role with the given permissions to a user.
func giveAppRole(t *testing.T, userId uint, roleName string, perms []string) {
	t.Helper()
	role, err := repositories.NewRoleRepository(nil).CreateAppRole(roleName, "", perms)
	if err != nil {
		t.Fatalf("create app role: %v", err)
	}
	if err := repositories.GetDB().Model(&models.User{}).Where("id = ?", userId).Update("app_role_id", role.ID).Error; err != nil {
		t.Fatalf("assign app role: %v", err)
	}
	ClearRolePermissionCacheForTests()
}

func TestGetReceiptForUserReturnsReceiptForMember(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId, groupId := seedReceiptMember(t, "getok", "getok-role", []string{permissions.GroupReceiptsRead})
	receipt := seedReceipt(t, "Lunch", groupId, userId)

	got, err := NewReceiptService(nil).GetReceiptForUser(userId, utils.UintToString(receipt.ID))
	if err != nil {
		t.Fatalf("GetReceiptForUser returned error: %v", err)
	}
	if got.ID != receipt.ID {
		t.Errorf("expected receipt %d, got %d", receipt.ID, got.ID)
	}
}

func TestGetReceiptForUserDeniesNonMember(t *testing.T) {
	defer repositories.TruncateTestDb()

	ownerId, groupId := seedReceiptMember(t, "owner", "owner-role", []string{permissions.GroupReceiptsRead})
	receipt := seedReceipt(t, "Lunch", groupId, ownerId)
	outsider := makeUser(t, "outsider")

	_, err := NewReceiptService(nil).GetReceiptForUser(outsider, utils.UintToString(receipt.ID))
	if !errors.Is(err, ErrReceiptAccessDenied) {
		t.Errorf("expected ErrReceiptAccessDenied for a non-member, got %v", err)
	}
}

func TestGetReceiptForUserDeniesMemberWithoutReadPermission(t *testing.T) {
	defer repositories.TruncateTestDb()

	// A member whose group role lacks group.receipts.read is denied — proving the
	// permission gate is enforced independently of group membership.
	userId, groupId := seedReceiptMember(t, "noread", "noread-role", []string{})
	receipt := seedReceipt(t, "Lunch", groupId, userId)

	_, err := NewReceiptService(nil).GetReceiptForUser(userId, utils.UintToString(receipt.ID))
	if !errors.Is(err, ErrReceiptAccessDenied) {
		t.Errorf("expected ErrReceiptAccessDenied for a member without group.receipts.read, got %v", err)
	}
}

// Everyone in a household sees all of it: a receipt somebody else paid for, with every category and tag on it.
func TestGetReceiptForUserShowsAnotherMembersReceiptWhole(t *testing.T) {
	defer repositories.TruncateTestDb()
	db := repositories.GetDB()

	category := models.Category{Name: "a-category"}
	tag := models.Tag{Name: "a-tag"}
	for _, m := range []interface{}{&category, &tag} {
		if err := db.Create(m).Error; err != nil {
			t.Fatalf("create fixture: %v", err)
		}
	}

	otherPayer := makeUser(t, "otherpayer")
	userId, groupId := seedReceiptMember(t, "reader", "reader-role", []string{permissions.GroupReceiptsRead})
	receipt := seedReceipt(t, "somebody-else-paid", groupId, otherPayer)
	if err := db.Model(&receipt).Association("Categories").Append([]models.Category{category}); err != nil {
		t.Fatalf("attach categories: %v", err)
	}
	if err := db.Model(&receipt).Association("Tags").Append([]models.Tag{tag}); err != nil {
		t.Fatalf("attach tags: %v", err)
	}

	got, err := NewReceiptService(nil).GetReceiptForUser(userId, utils.UintToString(receipt.ID))
	if err != nil {
		t.Fatalf("GetReceiptForUser returned error: %v", err)
	}
	if got.PaidByUserID != otherPayer {
		t.Errorf("expected the receipt paid by %d, got %d", otherPayer, got.PaidByUserID)
	}
	if len(got.Categories) != 1 || got.Categories[0].ID != category.ID {
		t.Errorf("expected the category on the receipt, got %+v", got.Categories)
	}
	if len(got.Tags) != 1 || got.Tags[0].ID != tag.ID {
		t.Errorf("expected the tag on the receipt, got %+v", got.Tags)
	}
}

func TestGetReceiptForUserDeniesMissingReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId := makeUser(t, "any")
	if _, err := NewReceiptService(nil).GetReceiptForUser(userId, "999999"); !errors.Is(err, ErrReceiptAccessDenied) {
		t.Errorf("expected ErrReceiptAccessDenied for a missing receipt, got %v", err)
	}
}

func TestSearchReceiptsForUserRequiresSearchPermission(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId := makeUser(t, "nosearch")
	if _, err := NewReceiptService(nil).SearchReceiptsForUser(userId, "coffee", 100); !errors.Is(err, ErrSearchForbidden) {
		t.Errorf("expected ErrSearchForbidden without app.receipts.search, got %v", err)
	}
}

func TestSearchReceiptsForUserScopesToTheUsersHouseholds(t *testing.T) {
	defer repositories.TruncateTestDb()

	payerA := makeUser(t, "sppayera")
	payerB := makeUser(t, "sppayerb")
	userId, groupId := seedReceiptMember(t, "spsearcher", "sp-role", []string{permissions.GroupReceiptsRead})
	giveAppRole(t, userId, "sp-app-role", []string{permissions.AppReceiptsSearch})

	// A receipt in another group the user does not belong to must be excluded by scope.
	otherGroup := models.Group{Name: "other"}
	if err := repositories.GetDB().Create(&otherGroup).Error; err != nil {
		t.Fatalf("create other group: %v", err)
	}

	seedReceipt(t, "Coffee one", groupId, payerA)
	seedReceipt(t, "Coffee two", groupId, payerB)
	seedReceipt(t, "Coffee elsewhere", otherGroup.ID, payerA)

	results, err := NewReceiptService(nil).SearchReceiptsForUser(userId, "Coffee", 100)
	if err != nil {
		t.Fatalf("SearchReceiptsForUser returned error: %v", err)
	}
	// Both receipts of the household, whoever paid, and nothing from the other one.
	if len(results) != 2 {
		t.Fatalf("expected the household's 2 receipts, got %d (%+v)", len(results), results)
	}
	for _, result := range results {
		if result.GroupID != groupId {
			t.Errorf("expected only receipts of the member's household, got %+v", result)
		}
	}
}

func TestSearchReceiptsForUserBlankQueryReturnsEmpty(t *testing.T) {
	defer repositories.TruncateTestDb()

	userId, groupId := seedReceiptMember(t, "blank", "blank-role", []string{permissions.GroupReceiptsRead})
	giveAppRole(t, userId, "blank-app-role", []string{permissions.AppReceiptsSearch})
	seedReceipt(t, "Coffee", groupId, userId)

	results, err := NewReceiptService(nil).SearchReceiptsForUser(userId, "   ", 100)
	if err != nil {
		t.Fatalf("SearchReceiptsForUser returned error: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected a blank query to return no results, got %d", len(results))
	}
}
