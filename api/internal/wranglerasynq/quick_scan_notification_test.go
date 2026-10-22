package wranglerasynq

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"
	"testing"
)

func quickScanNotifications(t *testing.T, userId uint) []models.Notification {
	t.Helper()
	var notifications []models.Notification
	if err := repositories.GetDB().Where("user_id = ?", userId).Find(&notifications).Error; err != nil {
		t.Fatalf("load notifications: %v", err)
	}
	return notifications
}

func TestNotifyQuickScanResultTellsTheUploaderOnly(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestUser()

	payload := QuickScanTaskPayload{Token: &structs.Claims{UserId: 1}, OriginalFileName: "shop.jpg"}
	notifyQuickScanResult(payload, quickScanReadyTitle, 42, "Edeka")
	notifyQuickScanResult(payload, quickScanFailedTitle, 0, "")

	notifications := quickScanNotifications(t, 1)
	if len(notifications) != 2 {
		utils.PrintTestError(t, len(notifications), 2)
		return
	}

	ready := notifications[0]
	if ready.Title != quickScanReadyTitle || !strings.Contains(ready.Body, "Edeka") || !strings.Contains(ready.Body, "receiptId:42") {
		utils.PrintTestError(t, ready, "a ready notification naming the receipt and linking it")
	}

	failed := notifications[1]
	if failed.Title != quickScanFailedTitle || !strings.Contains(failed.Body, "shop.jpg") {
		utils.PrintTestError(t, failed, "a failed notification naming the file")
	}
}

func TestNotifyQuickScanResultWithoutTokenIsANoop(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestUser()

	notifyQuickScanResult(QuickScanTaskPayload{}, quickScanReadyTitle, 1, "x")

	if got := len(quickScanNotifications(t, 1)); got != 0 {
		utils.PrintTestError(t, got, 0)
	}
}
