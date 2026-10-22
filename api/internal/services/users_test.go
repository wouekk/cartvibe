package services

import (
	"errors"
	"net/http"
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func createUserForDeletion(t *testing.T, username string) models.User {
	t.Helper()
	userRepo := repositories.NewUserRepository(nil)
	user, err := userRepo.CreateUser(commands.SignUpCommand{
		Username:    username,
		Password:    "password",
		DisplayName: username,
	})
	if err != nil {
		t.Fatalf("failed to create user %s: %v", username, err)
	}
	// The user is non-admin by default: the test harness seeds no system roles,
	// so CreateUser leaves AppRoleID nil and the user holds no app permissions.
	// The last-admin guard (defined by app.users.read) therefore won't interfere
	// with tests that aren't specifically exercising admin deletion behavior.
	// Tests that need an admin explicitly assign an admin role via makeUserAdmin.
	return user
}

// makeUserAdmin assigns the user an app role granting app.users.read, the modern
// definition of "administrator" used by the last-admin deletion guard (replacing
// the removed UserRole == ADMIN check). All admin promotions share a single role
// named adminRoleName so that several users count as distinct admins; the role is
// created on first use within a test (the DB is truncated between tests).
func makeUserAdmin(t *testing.T, userId uint) {
	t.Helper()
	const adminRoleName = "Test Admin Role"
	db := repositories.GetDB()
	roleRepository := repositories.NewRoleRepository(nil)

	roleId, err := roleRepository.GetAppRoleIdByName(adminRoleName)
	if err != nil {
		t.Fatalf("look up admin role: %v", err)
	}
	if roleId == nil {
		role, err := roleRepository.CreateAppRole(adminRoleName, "", []string{permissions.AppUsersRead}, false)
		if err != nil {
			t.Fatalf("create admin role: %v", err)
		}
		roleId = &role.ID
	}

	if err := db.Model(&models.User{}).Where("id = ?", userId).Update("app_role_id", *roleId).Error; err != nil {
		t.Fatalf("assign admin role: %v", err)
	}
	clearRolePermissionCacheAll()
}

func createTestReceiptForDeletion(t *testing.T, name string, paidByUserId uint, groupId uint) models.Receipt {
	t.Helper()
	db := repositories.GetDB()
	receipt := models.Receipt{
		Name:         name,
		Amount:       decimal.NewFromFloat(10.00),
		Date:         time.Now(),
		PaidByUserID: paidByUserId,
		GroupId:      groupId,
		Status:       models.OPEN,
	}
	if err := db.Create(&receipt).Error; err != nil {
		t.Fatalf("failed to create receipt: %v", err)
	}
	return receipt
}

func createTestCommentForDeletion(t *testing.T, receiptId uint, userId uint, text string) models.Comment {
	t.Helper()
	db := repositories.GetDB()
	comment := models.Comment{
		Comment:   text,
		ReceiptId: receiptId,
		UserId:    &userId,
	}
	if err := db.Create(&comment).Error; err != nil {
		t.Fatalf("failed to create comment: %v", err)
	}
	return comment
}

func createTestApiKeyForDeletion(t *testing.T, userId uint) models.ApiKey {
	t.Helper()
	db := repositories.GetDB()
	apiKey := models.ApiKey{
		ID:      utils.UintToString(userId) + "-test-key",
		Name:    "test key",
		UserID:  &userId,
		Prefix:  "key",
		Hmac:    "hmac",
		Version: 1,
		Scope:   "r",
	}
	if err := db.Create(&apiKey).Error; err != nil {
		t.Fatalf("failed to create api key: %v", err)
	}
	return apiKey
}

func createTestRefreshTokenForDeletion(t *testing.T, userId uint) models.RefreshToken {
	t.Helper()
	db := repositories.GetDB()
	token := models.RefreshToken{
		UserId:    userId,
		Token:     "test-token-" + utils.UintToString(userId),
		IsUsed:    false,
		ExpiresAt: time.Now().Add(24 * time.Hour),
	}
	if err := db.Create(&token).Error; err != nil {
		t.Fatalf("failed to create refresh token: %v", err)
	}
	return token
}

func createTestSystemTaskForDeletion(t *testing.T, userId uint) models.SystemTask {
	t.Helper()
	db := repositories.GetDB()
	task := models.SystemTask{
		Type:                 models.RECEIPT_UPLOADED,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		AssociatedEntityType: models.NOOP_ENTITY_TYPE,
		StartedAt:            time.Now(),
		RanByUserId:          &userId,
	}
	if err := db.Create(&task).Error; err != nil {
		t.Fatalf("failed to create system task: %v", err)
	}
	return task
}

func createTestTagForDeletion(t *testing.T, name string) models.Tag {
	t.Helper()
	db := repositories.GetDB()
	tag := models.Tag{Name: name}
	if err := db.Create(&tag).Error; err != nil {
		t.Fatalf("failed to create tag %s: %v", name, err)
	}
	return tag
}

func createTestCategoryForDeletion(t *testing.T, name string) models.Category {
	t.Helper()
	db := repositories.GetDB()
	category := models.Category{Name: name}
	if err := db.Create(&category).Error; err != nil {
		t.Fatalf("failed to create category %s: %v", name, err)
	}
	return category
}

func createTestFileDataForDeletion(t *testing.T, receiptId uint) models.FileData {
	t.Helper()
	db := repositories.GetDB()
	fd := models.FileData{
		Name:      "test-image.jpg",
		FileType:  "image/jpeg",
		Size:      1024,
		ReceiptId: receiptId,
	}
	if err := db.Create(&fd).Error; err != nil {
		t.Fatalf("failed to create file data: %v", err)
	}
	return fd
}

func assertJunctionCount(t *testing.T, table string, where string, args []interface{}, expected int64, desc string) {
	t.Helper()
	db := repositories.GetDB()
	var count int64
	if err := db.Table(table).Where(where, args...).Count(&count).Error; err != nil {
		t.Fatalf("failed to count %s in %s: %v", desc, table, err)
	}
	if count != expected {
		t.Errorf("%s: expected %d rows in %s, got %d", desc, expected, table, count)
	}
}

func assertCount(t *testing.T, model interface{}, where string, args []interface{}, expected int64, desc string) {
	t.Helper()
	db := repositories.GetDB()
	var count int64
	q := db.Model(model)
	if where != "" {
		q = q.Where(where, args...)
	}
	if err := q.Count(&count).Error; err != nil {
		t.Fatalf("failed to count %s: %v", desc, err)
	}
	if count != expected {
		t.Errorf("%s: expected %d, got %d", desc, expected, count)
	}
}

func getUserGroup(t *testing.T, userId uint) models.Group {
	t.Helper()
	db := repositories.GetDB()
	var gm models.GroupMember
	err := db.Where("user_id = ?", userId).First(&gm).Error
	if err != nil {
		t.Fatalf("failed to find group member for user %d: %v", userId, err)
	}
	var group models.Group
	err = db.First(&group, gm.GroupID).Error
	if err != nil {
		t.Fatalf("failed to find group %d: %v", gm.GroupID, err)
	}
	return group
}

func getNonAllGroupForUser(t *testing.T, userId uint) models.Group {
	t.Helper()
	db := repositories.GetDB()
	var groups []models.Group
	err := db.
		Joins("JOIN group_members ON group_members.group_id = groups.id").
		Where("group_members.user_id = ? AND groups.is_all_group = ?", userId, false).
		Find(&groups).Error
	if err != nil {
		t.Fatalf("failed to find non-all group for user %d: %v", userId, err)
	}
	if len(groups) == 0 {
		t.Fatalf("no non-all group found for user %d", userId)
	}
	return groups[0]
}

func TestDeleteUser_BasicDeletion(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "basicuser")

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 0, "user should be deleted")
}

func TestDeleteUser_WithPaidByGrant(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "paidbygrantuser")

	// A group role that grants paid-by visibility of this user's receipts.
	role, err := repositories.NewRoleRepository(nil).CreateGroupRole(
		"PaidBy Cascade Role",
		"",
		[]string{permissions.GroupReceiptsRead},
		nil,
		nil,
		[]uint{user.ID},
		false, false,
	)
	if err != nil {
		t.Fatalf("create group role: %v", err)
	}
	assertCount(t, &models.GroupRolePaidByUserGrant{}, "user_id = ?", []interface{}{user.ID}, 1, "paid-by grant should exist before delete")

	if err := DeleteUser(utils.UintToString(user.ID)); err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	// The User FK is OnDelete:CASCADE, so deleting the user removes its paid-by
	// grant rows without error; the role definition itself survives.
	assertCount(t, &models.GroupRolePaidByUserGrant{}, "user_id = ?", []interface{}{user.ID}, 0, "paid-by grant should cascade-delete with the user")
	assertCount(t, &models.GroupRoleDefinition{}, "id = ?", []interface{}{role.ID}, 1, "the group role should survive the user deletion")
}

func TestDeleteUser_KeepsReportTemplates(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "templateowner")

	template, err := repositories.NewReportTemplateRepository(nil).CreateReportTemplate(
		commands.ReportRequestCommand{Name: "Owned", Formats: []string{"csv"}},
		user.ID,
	)
	if err != nil {
		t.Fatalf("create report template: %v", err)
	}

	if err := DeleteUser(utils.UintToString(user.ID)); err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	// A report template is not cascade-deleted with its creator: it survives, and
	// its created_by is nulled (via modelsWithCreatedBy in DeleteUser).
	assertCount(t, &models.ReportTemplate{}, "id = ?", []interface{}{template.ID}, 1, "the template should survive the user deletion")
	assertCount(t, &models.ReportTemplate{}, "id = ? AND created_by IS NULL", []interface{}{template.ID}, 1, "the template's created_by should be nulled")
}

func TestDeleteUser_OnlyGroupMember(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "sologroupuser")

	// Get the default group created for user (not the "All" group)
	group := getNonAllGroupForUser(t, user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.Group{}, "id = ?", []interface{}{group.ID}, 0, "solo-member group should be deleted")
}

func TestDeleteUser_MultiMemberGroup(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "multiuser1")
	otherUser := createUserForDeletion(t, "multiuser2")

	group := getNonAllGroupForUser(t, user.ID)

	// Add otherUser to user's group
	db := repositories.GetDB()
	db.Create(&models.GroupMember{UserID: otherUser.ID, GroupID: group.ID})

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.Group{}, "id = ?", []interface{}{group.ID}, 1, "multi-member group should survive")
	assertCount(t, &models.GroupMember{}, "user_id = ? AND group_id = ?", []interface{}{user.ID, group.ID}, 0, "user's group membership should be removed")
	assertCount(t, &models.GroupMember{}, "user_id = ? AND group_id = ?", []interface{}{otherUser.ID, group.ID}, 1, "other user's group membership should survive")
}

// TestDeleteUser_RemovesMemberGrants pins the user-teardown half of the grant
// resurrection hazard.
//
// Grant rows are keyed (user, group) with no FK to group_members, and DeleteUser
// removes memberships with a raw tx.Delete that cascades nothing — so orphaned
// rows would be silently re-adopted if the same user id were ever reused.
//
// The user is put in TWO surviving multi-member groups on purpose: the cleanup
// helper (DeleteMemberGrantsForUser) is deliberately group-WIDE, and a
// per-group loop bolted onto the membership-removal loop would leave the second
// group's rows behind.
func TestDeleteUser_RemovesMemberGrants(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "grantuser")
	otherUser := createUserForDeletion(t, "grantuserother")

	db := repositories.GetDB()
	category := models.Category{Name: "Grant Cascade Category"}
	if err := db.Create(&category).Error; err != nil {
		t.Fatalf("seed category: %v", err)
	}

	// The user's own group, plus a second one — both kept alive by otherUser so
	// DeleteUser removes the memberships instead of deleting the groups.
	// These creates are checked because the co-members are what keep both groups
	// alive: if one silently fails, DeleteUser deletes that group instead of just
	// the membership, the grants are cleaned up by the group-delete path, and the
	// assertions below pass without ever exercising the group-wide cleanup this
	// test exists to pin.
	firstGroup := getNonAllGroupForUser(t, user.ID)
	// otherUser already joined the Household (Phase 3 M5), which is the first user's group.
	if err := db.Where(models.GroupMember{UserID: otherUser.ID, GroupID: firstGroup.ID}).FirstOrCreate(&models.GroupMember{}).Error; err != nil {
		t.Fatalf("seed first group co-member: %v", err)
	}

	secondGroup := models.Group{Name: "Grant Cascade Second Group"}
	if err := db.Create(&secondGroup).Error; err != nil {
		t.Fatalf("seed second group: %v", err)
	}
	for _, memberUserId := range []uint{user.ID, otherUser.ID} {
		if err := db.Create(&models.GroupMember{UserID: memberUserId, GroupID: secondGroup.ID}).Error; err != nil {
			t.Fatalf("seed second group member %d: %v", memberUserId, err)
		}
	}

	groupMemberRepository := repositories.NewGroupMemberRepository(nil)
	for _, groupId := range []uint{firstGroup.ID, secondGroup.ID} {
		if err := groupMemberRepository.ReplaceMemberGrants(user.ID, groupId, []uint{category.ID}, nil); err != nil {
			t.Fatalf("seed member grants: %v", err)
		}
	}
	// otherUser keeps an assignment too — it must survive the delete.
	if err := groupMemberRepository.ReplaceMemberGrants(otherUser.ID, firstGroup.ID, []uint{category.ID}, nil); err != nil {
		t.Fatalf("seed other member grants: %v", err)
	}

	assertCount(t, &models.GroupMemberCategoryGrant{}, "user_id = ?", []interface{}{user.ID}, 2, "member grants should exist before delete")

	if err := DeleteUser(utils.UintToString(user.ID)); err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.GroupMemberCategoryGrant{}, "user_id = ?", []interface{}{user.ID}, 0, "the deleted user's member grants should be gone from EVERY group")
	assertCount(t, &models.GroupMemberCategoryGrant{}, "user_id = ?", []interface{}{otherUser.ID}, 1, "another member's grants should survive the delete")
	assertCount(t, &models.Category{}, "id = ?", []interface{}{category.ID}, 1, "the category itself should survive the delete")
}

func TestDeleteUser_WithNotifications(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "notifuser")

	db := repositories.GetDB()
	db.Create(&models.Notification{
		Type:   models.NOTIFICATION_TYPE_NORMAL,
		Title:  "test",
		Body:   "test body",
		UserId: user.ID,
	})

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.Notification{}, "user_id = ?", []interface{}{user.ID}, 0, "notifications should be deleted")
}

func TestDeleteUser_WithPreferencesAndShortcuts(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "prefuser")

	// UserPreferences are auto-created by CreateUser, so just verify they get deleted
	assertCount(t, &models.UserPrefernces{}, "user_id = ?", []interface{}{user.ID}, 1, "preferences should exist before deletion")

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.UserPrefernces{}, "user_id = ?", []interface{}{user.ID}, 0, "preferences should be deleted")
}

func TestDeleteUser_ReferencedInOtherPreferences(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "refprefuser")
	otherUser := createUserForDeletion(t, "otherprefuser")

	db := repositories.GetDB()
	db.Model(&models.UserPrefernces{}).Where("user_id = ?", otherUser.ID).Update("quick_scan_default_paid_by_id", user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	var prefs models.UserPrefernces
	db.Where("user_id = ?", otherUser.ID).First(&prefs)
	if prefs.QuickScanDefaultPaidById != nil {
		t.Errorf("QuickScanDefaultPaidById should be nullified, got %v", *prefs.QuickScanDefaultPaidById)
	}
}

func TestDeleteUser_WithRefreshTokens(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "tokenuser")

	createTestRefreshTokenForDeletion(t, user.ID)
	createTestRefreshTokenForDeletion(t, user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.RefreshToken{}, "user_id = ?", []interface{}{user.ID}, 0, "refresh tokens should be deleted")
}

// DeleteUser removes the user's OIDC rows itself rather than leaving them to the
// database. An orphaned identity would sign its subject into whichever account
// later reuses the id, and the auth session and exchange code tables carry no
// foreign key to cascade from at all.
func TestDeleteUser_RemovesOidcRecords(t *testing.T) {
	defer repositories.TruncateTestDb()
	db := repositories.GetDB()

	user := createUserForDeletion(t, "oidcdeleted")
	other := createUserForDeletion(t, "oidckept")

	identity := seedOidcIdentity(t, user.ID, "keycloak", true)
	seedOidcIdentity(t, other.ID, "authentik", false)

	expiresAt := time.Now().Add(10 * time.Minute)
	linkUserId := user.ID
	seeds := []interface{}{
		&models.OidcAuthSession{
			OidcProviderId: identity.OidcProviderId,
			StateHash:      "state-hash",
			NonceHash:      "nonce-hash",
			CodeVerifier:   "verifier",
			LinkUserId:     &linkUserId,
			ExpiresAt:      expiresAt,
		},
		&models.OidcDeleteConfirmation{
			CodeHash:  "delete-confirmation-hash",
			UserId:    user.ID,
			ExpiresAt: expiresAt,
		},
	}
	for _, seed := range seeds {
		if err := db.Create(seed).Error; err != nil {
			t.Fatalf("failed to seed %T: %v", seed, err)
		}
	}

	// Run the delete with foreign keys off, so the assertions below fail if the
	// cascade is the only thing removing the rows.
	restore, err := repositories.UseTestDbWithoutForeignKeysForTests()
	if err != nil {
		t.Fatalf("failed to open the test database without foreign keys: %v", err)
	}
	defer restore()

	var foreignKeys int
	if err := repositories.GetDB().Raw("PRAGMA foreign_keys").Scan(&foreignKeys).Error; err != nil {
		t.Fatalf("failed to read the foreign_keys pragma: %v", err)
	}
	if foreignKeys != 0 {
		t.Fatalf("foreign keys are still enforced, so the cascade alone would pass this test")
	}

	if err := DeleteUser(utils.UintToString(user.ID)); err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.OidcIdentity{}, "user_id = ?", []interface{}{user.ID}, 0, "the deleted user's identities should be gone")
	assertCount(t, &models.OidcAuthSession{}, "link_user_id = ?", []interface{}{user.ID}, 0, "pending link sessions for the deleted user should be gone")
	assertCount(t, &models.OidcDeleteConfirmation{}, "user_id = ?", []interface{}{user.ID}, 0, "delete confirmations for the deleted user should be gone")
	assertCount(t, &models.OidcIdentity{}, "user_id = ?", []interface{}{other.ID}, 1, "another user's identity should survive")
}

func TestDeleteUser_WithCommentsOnOtherReceipts(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "commentuser")
	otherUser := createUserForDeletion(t, "othercommentuser")
	otherGroup := getNonAllGroupForUser(t, otherUser.ID)

	receipt := createTestReceiptForDeletion(t, "other receipt", otherUser.ID, otherGroup.ID)
	comment := createTestCommentForDeletion(t, receipt.ID, user.ID, "my comment")

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	// Comment should still exist but with nullified UserId
	db := repositories.GetDB()
	var updatedComment models.Comment
	db.First(&updatedComment, comment.ID)
	if updatedComment.UserId != nil {
		t.Errorf("Comment.UserId should be nil, got %v", *updatedComment.UserId)
	}
	if updatedComment.Comment != "my comment" {
		t.Errorf("Comment text should be preserved, got %s", updatedComment.Comment)
	}
}

func TestDeleteUser_WithApiKeys(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "apikeyuser")

	createTestApiKeyForDeletion(t, user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.ApiKey{}, "user_id = ?", []interface{}{user.ID}, 0, "API keys should be deleted")
}

func TestDeleteUser_WithSystemTasks(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "systaskuser")

	task := createTestSystemTaskForDeletion(t, user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	db := repositories.GetDB()
	var updatedTask models.SystemTask
	db.First(&updatedTask, task.ID)
	if updatedTask.RanByUserId != nil {
		t.Errorf("SystemTask.RanByUserId should be nil, got %v", *updatedTask.RanByUserId)
	}
}

func TestDeleteUser_WithCreatedByReferences(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "createdbyuser")
	otherUser := createUserForDeletion(t, "othercreatedbyuser")

	db := repositories.GetDB()
	otherGroup := getNonAllGroupForUser(t, otherUser.ID)

	// Create a receipt with CreatedBy set to the user being deleted
	receipt := models.Receipt{
		Name:         "created by test",
		Amount:       decimal.NewFromFloat(5.00),
		Date:         time.Now(),
		PaidByUserID: otherUser.ID,
		GroupId:      otherGroup.ID,
		Status:       models.OPEN,
		BaseModel:    models.BaseModel{CreatedBy: &user.ID},
	}
	db.Create(&receipt)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	var updatedReceipt models.Receipt
	db.First(&updatedReceipt, receipt.ID)
	if updatedReceipt.CreatedBy != nil {
		t.Errorf("Receipt.CreatedBy should be nil, got %v", *updatedReceipt.CreatedBy)
	}
}

func TestDeleteUser_ApiKeyWithSystemTaskRef(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "apitaskuser")

	apiKey := createTestApiKeyForDeletion(t, user.ID)

	// Create a system task referencing the API key
	db := repositories.GetDB()
	task := models.SystemTask{
		Type:                 models.API_KEY_DELETED,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		AssociatedEntityType: models.API_KEY,
		StartedAt:            time.Now(),
		ApiKeyId:             &apiKey.ID,
	}
	db.Create(&task)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	var updatedTask models.SystemTask
	db.First(&updatedTask, task.ID)
	if updatedTask.ApiKeyId != nil {
		t.Errorf("SystemTask.ApiKeyId should be nil, got %v", *updatedTask.ApiKeyId)
	}
	assertCount(t, &models.ApiKey{}, "id = ?", []interface{}{apiKey.ID}, 0, "API key should be deleted")
}

func TestBulkDeleteUsers(t *testing.T) {
	defer repositories.TruncateTestDb()
	user1 := createUserForDeletion(t, "bulkuser1")
	user2 := createUserForDeletion(t, "bulkuser2")
	survivor := createUserForDeletion(t, "bulksurvivor")

	err := BulkDeleteUsers([]string{utils.UintToString(user1.ID), utils.UintToString(user2.ID)})
	if err != nil {
		t.Fatalf("BulkDeleteUsers failed: %v", err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{user1.ID}, 0, "user1 should be deleted")
	assertCount(t, &models.User{}, "id = ?", []interface{}{user2.ID}, 0, "user2 should be deleted")
	assertCount(t, &models.User{}, "id = ?", []interface{}{survivor.ID}, 1, "survivor should remain")
}

func TestDeleteUser_ShouldPreventLastAdminDeletion(t *testing.T) {
	defer repositories.TruncateTestDb()
	admin := createUserForDeletion(t, "soloadmin")
	makeUserAdmin(t, admin.ID)

	err := DeleteUser(utils.UintToString(admin.ID))
	if err == nil {
		t.Fatalf("expected error when deleting last admin, got nil")
	}
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("unexpected error: %v", err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{admin.ID}, 1, "last admin should survive")
}

func TestDeleteUser_ShouldAllowDeletionWhenMultipleAdmins(t *testing.T) {
	defer repositories.TruncateTestDb()
	admin1 := createUserForDeletion(t, "admin1")
	admin2 := createUserForDeletion(t, "admin2")

	makeUserAdmin(t, admin1.ID)
	makeUserAdmin(t, admin2.ID)

	err := DeleteUser(utils.UintToString(admin1.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{admin1.ID}, 0, "admin1 should be deleted")
	assertCount(t, &models.User{}, "id = ?", []interface{}{admin2.ID}, 1, "admin2 should survive")
}

func TestDeleteAccountForUser_ShouldFailWithWrongPassword(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "wrongpwuser")

	statusCode, err := DeleteAccountForUser(user.ID, commands.DeleteAccountCommand{Password: "wrongpassword"})
	if err == nil {
		t.Fatalf("expected error for wrong password, got nil")
	}
	if statusCode != http.StatusUnauthorized {
		t.Errorf("expected status %d, got %d", http.StatusUnauthorized, statusCode)
	}
	if err.Error() != "invalid password" {
		t.Errorf("unexpected error message: %v", err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 1, "user should survive wrong password attempt")
}

func TestDeleteAccountForUser_ShouldSucceed(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "deleteacctuser")

	statusCode, err := DeleteAccountForUser(user.ID, commands.DeleteAccountCommand{Password: "password"})
	if err != nil {
		t.Fatalf("DeleteAccountForUser failed: %v", err)
	}
	if statusCode != 0 {
		t.Errorf("expected status 0, got %d", statusCode)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 0, "user should be deleted")
}

func TestDeleteAccountForUser_ShouldPreventLastAdminDeletion(t *testing.T) {
	defer repositories.TruncateTestDb()
	admin := createUserForDeletion(t, "lastadminacct")
	makeUserAdmin(t, admin.ID)

	statusCode, err := DeleteAccountForUser(admin.ID, commands.DeleteAccountCommand{Password: "password"})
	if err == nil {
		t.Fatalf("expected error when deleting last admin account, got nil")
	}
	if statusCode != http.StatusBadRequest {
		t.Errorf("expected status %d, got %d", http.StatusBadRequest, statusCode)
	}
	if !errors.Is(err, ErrLastAdmin) {
		t.Errorf("unexpected error: %v", err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{admin.ID}, 1, "last admin should survive")
}

// seedDeleteConfirmation stores a confirmation code for userId the way the OIDC
// callback does: hashed, single-use and short-lived.
func seedDeleteConfirmation(t *testing.T, userId uint, code string, expiresAt time.Time, used bool) {
	t.Helper()

	row := models.OidcDeleteConfirmation{
		CodeHash:  utils.Sha256Hash([]byte(code)),
		UserId:    userId,
		Used:      used,
		ExpiresAt: expiresAt,
	}
	if err := repositories.GetDB().Create(&row).Error; err != nil {
		t.Fatalf("failed to seed the delete confirmation: %v", err)
	}
}

// An account with no password of its own deletes itself with the code its
// provider sign-in produced, in place of the password it does not have.
func TestDeleteAccountForUser_PasswordlessAccountDeletesWithAConfirmationCode(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "oidconlydelete")
	seedOidcIdentity(t, user.ID, "keycloak", true)
	seedDeleteConfirmation(t, user.ID, "a-valid-code", time.Now().Add(5*time.Minute), false)

	statusCode, err := DeleteAccountForUser(user.ID, commands.DeleteAccountCommand{ConfirmationCode: "a-valid-code"})
	if err != nil {
		t.Fatalf("expected the delete to succeed, got %d: %v", statusCode, err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 0, "the account should be deleted")
}

// Anything but a live code issued to this very account is refused, and refused
// with a 400 -- never the password path's 401, which the desktop reads as "ask
// for the password again".
func TestDeleteAccountForUser_PasswordlessAccountRefusesABadConfirmation(t *testing.T) {
	for _, testCase := range []struct {
		name    string
		command commands.DeleteAccountCommand
		seed    func(t *testing.T, userId uint, otherId uint)
	}{
		{
			name:    "no code",
			command: commands.DeleteAccountCommand{},
			seed:    func(t *testing.T, userId uint, otherId uint) {},
		},
		{
			name:    "a password instead of a code",
			command: commands.DeleteAccountCommand{Password: "password"},
			seed:    func(t *testing.T, userId uint, otherId uint) {},
		},
		{
			name:    "an unknown code",
			command: commands.DeleteAccountCommand{ConfirmationCode: "never-issued"},
			seed:    func(t *testing.T, userId uint, otherId uint) {},
		},
		{
			name:    "a spent code",
			command: commands.DeleteAccountCommand{ConfirmationCode: "spent"},
			seed: func(t *testing.T, userId uint, otherId uint) {
				seedDeleteConfirmation(t, userId, "spent", time.Now().Add(5*time.Minute), true)
			},
		},
		{
			name:    "an expired code",
			command: commands.DeleteAccountCommand{ConfirmationCode: "expired"},
			seed: func(t *testing.T, userId uint, otherId uint) {
				seedDeleteConfirmation(t, userId, "expired", time.Now().Add(-time.Minute), false)
			},
		},
		{
			name:    "another account's code",
			command: commands.DeleteAccountCommand{ConfirmationCode: "not-yours"},
			seed: func(t *testing.T, userId uint, otherId uint) {
				seedDeleteConfirmation(t, otherId, "not-yours", time.Now().Add(5*time.Minute), false)
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			defer repositories.TruncateTestDb()
			user := createUserForDeletion(t, "oidconlyrefused")
			other := createUserForDeletion(t, "oidconlyother")
			seedOidcIdentity(t, user.ID, "keycloak", true)
			testCase.seed(t, user.ID, other.ID)

			statusCode, err := DeleteAccountForUser(user.ID, testCase.command)
			if err == nil {
				t.Fatalf("expected the delete to be refused")
			}
			if statusCode != http.StatusBadRequest {
				t.Errorf("expected status %d, got %d", http.StatusBadRequest, statusCode)
			}

			assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 1, "the account should survive")
		})
	}
}

// A code is spent by the delete it confirms, so it cannot confirm a second one.
func TestDeleteAccountForUser_ConfirmationCodeIsSingleUse(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "oidconlysingleuse")
	seedOidcIdentity(t, user.ID, "keycloak", true)
	seedDeleteConfirmation(t, user.ID, "once", time.Now().Add(5*time.Minute), false)

	// The last-admin guard refuses this delete AFTER the code is checked, which is
	// the one way a code can be spent without the account going with it.
	makeUserAdmin(t, user.ID)

	statusCode, err := DeleteAccountForUser(user.ID, commands.DeleteAccountCommand{ConfirmationCode: "once"})
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("expected ErrLastAdmin, got %d: %v", statusCode, err)
	}

	statusCode, err = DeleteAccountForUser(user.ID, commands.DeleteAccountCommand{ConfirmationCode: "once"})
	if err == nil || statusCode != http.StatusBadRequest {
		t.Fatalf("expected a spent code to be refused with 400, got %d: %v", statusCode, err)
	}
}

// An account with a password keeps confirming with it; a confirmation code is not
// a way around the password.
func TestDeleteAccountForUser_PasswordAccountIgnoresAConfirmationCode(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "passwordkept")
	seedDeleteConfirmation(t, user.ID, "a-code", time.Now().Add(5*time.Minute), false)

	statusCode, err := DeleteAccountForUser(user.ID, commands.DeleteAccountCommand{ConfirmationCode: "a-code"})
	if err == nil || statusCode != http.StatusUnauthorized {
		t.Fatalf("expected the password path's 401, got %d: %v", statusCode, err)
	}

	assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 1, "the account should survive")
}

func TestDeleteUser_WithCommentsHavingReplies(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "replycommentuser")
	otherUser := createUserForDeletion(t, "otherreplycommentuser")

	db := repositories.GetDB()
	otherGroup := getNonAllGroupForUser(t, otherUser.ID)

	receipt := createTestReceiptForDeletion(t, "reply receipt", otherUser.ID, otherGroup.ID)

	// User's comment with a reply from other user
	comment := createTestCommentForDeletion(t, receipt.ID, user.ID, "parent from deleted user")
	reply := models.Comment{
		Comment:   "reply from other user",
		ReceiptId: receipt.ID,
		UserId:    &otherUser.ID,
		CommentId: &comment.ID,
	}
	db.Create(&reply)

	// Other user's comment with a reply from user being deleted
	otherComment := createTestCommentForDeletion(t, receipt.ID, otherUser.ID, "parent from other user")
	userReply := models.Comment{
		Comment:   "reply from deleted user",
		ReceiptId: receipt.ID,
		UserId:    &user.ID,
		CommentId: &otherComment.ID,
	}
	db.Create(&userReply)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	// Parent comment by deleted user should still exist with nullified user_id
	var updatedComment models.Comment
	db.First(&updatedComment, comment.ID)
	if updatedComment.UserId != nil {
		t.Errorf("parent comment UserId should be nil, got %v", *updatedComment.UserId)
	}
	if updatedComment.Comment != "parent from deleted user" {
		t.Errorf("parent comment text should be preserved, got %s", updatedComment.Comment)
	}

	// Reply from other user should be intact
	var updatedReply models.Comment
	db.First(&updatedReply, reply.ID)
	if updatedReply.UserId == nil || *updatedReply.UserId != otherUser.ID {
		t.Errorf("reply UserId should be %d, got %v", otherUser.ID, updatedReply.UserId)
	}
	if updatedReply.CommentId == nil || *updatedReply.CommentId != comment.ID {
		t.Errorf("reply should still reference parent comment %d", comment.ID)
	}

	// Other user's comment should be intact
	var updatedOtherComment models.Comment
	db.First(&updatedOtherComment, otherComment.ID)
	if updatedOtherComment.UserId == nil || *updatedOtherComment.UserId != otherUser.ID {
		t.Errorf("other comment UserId should be %d", otherUser.ID)
	}

	// Reply from deleted user should still exist with nullified user_id
	var updatedUserReply models.Comment
	db.First(&updatedUserReply, userReply.ID)
	if updatedUserReply.UserId != nil {
		t.Errorf("user reply UserId should be nil, got %v", *updatedUserReply.UserId)
	}
	if updatedUserReply.Comment != "reply from deleted user" {
		t.Errorf("user reply text should be preserved, got %s", updatedUserReply.Comment)
	}
	if updatedUserReply.CommentId == nil || *updatedUserReply.CommentId != otherComment.ID {
		t.Errorf("user reply should still reference parent comment %d", otherComment.ID)
	}
}
