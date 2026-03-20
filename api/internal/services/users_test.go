package services

import (
	"encoding/json"
	"errors"
	"net/http"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/utils"
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
	// Ensure user is non-admin so the last-admin guard doesn't interfere
	// with tests that aren't specifically testing admin deletion behavior.
	// Tests that need admin role should explicitly set it.
	repositories.GetDB().Model(&models.User{}).Where("id = ?", user.ID).Update("user_role", models.USER)
	user.UserRole = models.USER
	return user
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

func createTestItemForDeletion(t *testing.T, receiptId uint, chargedToUserId uint) models.Item {
	t.Helper()
	db := repositories.GetDB()
	item := models.Item{
		Name:            "test item",
		Amount:          decimal.NewFromFloat(5.00),
		ReceiptId:       receiptId,
		ChargedToUserId: &chargedToUserId,
		Status:          models.ITEM_OPEN,
	}
	if err := db.Create(&item).Error; err != nil {
		t.Fatalf("failed to create item: %v", err)
	}
	return item
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

func createTestDashboardForDeletion(t *testing.T, userId uint, groupId uint) models.Dashboard {
	t.Helper()
	db := repositories.GetDB()
	dashboard := models.Dashboard{
		Name:   "test dashboard",
		UserID: userId,
		GroupID: groupId,
		Widgets: []models.Widget{
			{
				Name:          "test widget",
				WidgetType:    models.GROUP_SUMMARY,
				Configuration: json.RawMessage(`{}`),
			},
		},
	}
	if err := db.Create(&dashboard).Error; err != nil {
		t.Fatalf("failed to create dashboard: %v", err)
	}
	return dashboard
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

func TestDeleteUser_WithReceipts(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "receiptuser")
	otherUser := createUserForDeletion(t, "otheruser")

	group := getNonAllGroupForUser(t, user.ID)
	otherGroup := getNonAllGroupForUser(t, otherUser.ID)

	// Receipt owned by user
	createTestReceiptForDeletion(t, "user receipt", user.ID, group.ID)

	// Receipt owned by other user with item charged to user
	otherReceipt := createTestReceiptForDeletion(t, "other receipt", otherUser.ID, otherGroup.ID)
	createTestItemForDeletion(t, otherReceipt.ID, user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.Receipt{}, "paid_by_user_id = ?", []interface{}{user.ID}, 0, "user's receipts should be deleted")
	assertCount(t, &models.Item{}, "charged_to_user_id = ?", []interface{}{user.ID}, 0, "items charged to user should be deleted")
	assertCount(t, &models.Receipt{}, "id = ?", []interface{}{otherReceipt.ID}, 1, "other user's receipt should survive")
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

func TestDeleteUser_ReferencedInGroupSettings(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "refgsuser")
	otherUser := createUserForDeletion(t, "othergsuser")

	otherGroup := getNonAllGroupForUser(t, otherUser.ID)

	db := repositories.GetDB()
	db.Model(&models.GroupSettings{}).Where("group_id = ?", otherGroup.ID).Update("email_default_receipt_paid_by_id", user.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	var gs models.GroupSettings
	db.Where("group_id = ?", otherGroup.ID).First(&gs)
	if gs.EmailDefaultReceiptPaidById != nil {
		t.Errorf("EmailDefaultReceiptPaidById should be nullified, got %v", *gs.EmailDefaultReceiptPaidById)
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

func TestDeleteUser_WithDashboards(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "dashuser")
	group := getNonAllGroupForUser(t, user.ID)

	dashboard := createTestDashboardForDeletion(t, user.ID, group.ID)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	assertCount(t, &models.Dashboard{}, "user_id = ?", []interface{}{user.ID}, 0, "dashboards should be deleted")
	assertCount(t, &models.Widget{}, "dashboard_id = ?", []interface{}{dashboard.ID}, 0, "widgets should be deleted")
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

func TestDeleteUser_Comprehensive(t *testing.T) {
	defer repositories.TruncateTestDb()
	user := createUserForDeletion(t, "comprehensiveuser")
	otherUser := createUserForDeletion(t, "othercompuser")

	db := repositories.GetDB()
	userGroup := getNonAllGroupForUser(t, user.ID)
	otherGroup := getNonAllGroupForUser(t, otherUser.ID)

	// Add otherUser to user's group (making it multi-member)
	db.Create(&models.GroupMember{UserID: otherUser.ID, GroupID: userGroup.ID})

	// Create receipts
	userReceipt := createTestReceiptForDeletion(t, "user receipt", user.ID, userGroup.ID)
	otherReceipt := createTestReceiptForDeletion(t, "other receipt", otherUser.ID, otherGroup.ID)

	// Item charged to user on other's receipt
	createTestItemForDeletion(t, otherReceipt.ID, user.ID)

	// Comment on other's receipt
	createTestCommentForDeletion(t, otherReceipt.ID, user.ID, "comprehensive comment")

	// Dashboard
	dashboard := createTestDashboardForDeletion(t, user.ID, userGroup.ID)

	// API key with system task reference
	apiKey := createTestApiKeyForDeletion(t, user.ID)
	apiTask := models.SystemTask{
		Type:                 models.API_KEY_DELETED,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		AssociatedEntityType: models.API_KEY,
		StartedAt:            time.Now(),
		ApiKeyId:             &apiKey.ID,
	}
	db.Create(&apiTask)

	// Refresh tokens
	createTestRefreshTokenForDeletion(t, user.ID)

	// System task
	createTestSystemTaskForDeletion(t, user.ID)

	// Notification
	db.Create(&models.Notification{
		Type:   models.NOTIFICATION_TYPE_NORMAL,
		Title:  "test",
		Body:   "test body",
		UserId: user.ID,
	})

	// Set other user's preferences to reference this user
	db.Model(&models.UserPrefernces{}).Where("user_id = ?", otherUser.ID).Update("quick_scan_default_paid_by_id", user.ID)

	// Set group settings to reference this user
	db.Model(&models.GroupSettings{}).Where("group_id = ?", otherGroup.ID).Update("email_default_receipt_paid_by_id", user.ID)

	// Created-by reference
	receiptWithCreatedBy := models.Receipt{
		Name:         "created by test",
		Amount:       decimal.NewFromFloat(5.00),
		Date:         time.Now(),
		PaidByUserID: otherUser.ID,
		GroupId:      otherGroup.ID,
		Status:       models.OPEN,
		BaseModel:    models.BaseModel{CreatedBy: &user.ID},
	}
	db.Create(&receiptWithCreatedBy)

	err := DeleteUser(utils.UintToString(user.ID))
	if err != nil {
		t.Fatalf("DeleteUser failed: %v", err)
	}

	// Verify all cleanup
	assertCount(t, &models.User{}, "id = ?", []interface{}{user.ID}, 0, "user should be deleted")
	assertCount(t, &models.RefreshToken{}, "user_id = ?", []interface{}{user.ID}, 0, "refresh tokens should be deleted")
	assertCount(t, &models.ApiKey{}, "user_id = ?", []interface{}{user.ID}, 0, "API keys should be deleted")
	assertCount(t, &models.Receipt{}, "id = ?", []interface{}{userReceipt.ID}, 0, "user's receipt should be deleted")
	assertCount(t, &models.Item{}, "charged_to_user_id = ?", []interface{}{user.ID}, 0, "items charged to user should be deleted")
	assertCount(t, &models.Dashboard{}, "id = ?", []interface{}{dashboard.ID}, 0, "dashboard should be deleted")
	assertCount(t, &models.Widget{}, "dashboard_id = ?", []interface{}{dashboard.ID}, 0, "widgets should be deleted")
	assertCount(t, &models.Notification{}, "user_id = ?", []interface{}{user.ID}, 0, "notifications should be deleted")
	assertCount(t, &models.UserPrefernces{}, "user_id = ?", []interface{}{user.ID}, 0, "preferences should be deleted")
	assertCount(t, &models.GroupMember{}, "user_id = ?", []interface{}{user.ID}, 0, "group memberships should be removed")

	// Multi-member group should survive
	assertCount(t, &models.Group{}, "id = ?", []interface{}{userGroup.ID}, 1, "multi-member group should survive")

	// Nullified references
	var comment models.Comment
	db.Where("receipt_id = ? AND comment = ?", otherReceipt.ID, "comprehensive comment").First(&comment)
	if comment.UserId != nil {
		t.Errorf("Comment.UserId should be nil")
	}

	var updatedApiTask models.SystemTask
	db.First(&updatedApiTask, apiTask.ID)
	if updatedApiTask.ApiKeyId != nil {
		t.Errorf("SystemTask.ApiKeyId should be nil")
	}

	var prefs models.UserPrefernces
	db.Where("user_id = ?", otherUser.ID).First(&prefs)
	if prefs.QuickScanDefaultPaidById != nil {
		t.Errorf("QuickScanDefaultPaidById should be nil")
	}

	var gs models.GroupSettings
	db.Where("group_id = ?", otherGroup.ID).First(&gs)
	if gs.EmailDefaultReceiptPaidById != nil {
		t.Errorf("EmailDefaultReceiptPaidById should be nil")
	}

	var updatedReceipt models.Receipt
	db.First(&updatedReceipt, receiptWithCreatedBy.ID)
	if updatedReceipt.CreatedBy != nil {
		t.Errorf("Receipt.CreatedBy should be nil")
	}

	// Other user should be unaffected
	assertCount(t, &models.User{}, "id = ?", []interface{}{otherUser.ID}, 1, "other user should survive")
	assertCount(t, &models.Receipt{}, "id = ?", []interface{}{otherReceipt.ID}, 1, "other user's receipt should survive")
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

	db := repositories.GetDB()
	db.Model(&models.User{}).Where("id = ?", admin.ID).Update("user_role", models.ADMIN)

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

	db := repositories.GetDB()
	db.Model(&models.User{}).Where("id = ?", admin1.ID).Update("user_role", models.ADMIN)
	db.Model(&models.User{}).Where("id = ?", admin2.ID).Update("user_role", models.ADMIN)

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

	statusCode, err := DeleteAccountForUser(user.ID, "wrongpassword")
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

	statusCode, err := DeleteAccountForUser(user.ID, "password")
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

	db := repositories.GetDB()
	db.Model(&models.User{}).Where("id = ?", admin.ID).Update("user_role", models.ADMIN)

	statusCode, err := DeleteAccountForUser(admin.ID, "password")
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
