package jobs

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"errors"
	"strings"
	"testing"
	"time"
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

func TestNotifyQuickScanResultSavedWithoutTheAiLinksTheReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestUser()

	payload := QuickScanTaskPayload{Token: &structs.Claims{UserId: 1}, OriginalFileName: "shop.jpg"}
	notifyQuickScanResult(payload, quickScanFailedTitle, 7, "")

	notifications := quickScanNotifications(t, 1)
	if len(notifications) != 1 {
		utils.PrintTestError(t, len(notifications), 1)
		return
	}
	body := notifications[0].Body
	if !strings.Contains(body, "shop.jpg") || !strings.Contains(body, "fill in") || !strings.Contains(body, "receiptId:7") {
		utils.PrintTestError(t, body, "a notification naming the file and linking the receipt to fill in")
	}
}

func TestQuickScanSlotWaitEndsWithTheTask(t *testing.T) {
	release, err := acquireQuickScanSlot(context.Background())
	if err != nil {
		t.Fatalf("first scan should get the slot: %v", err)
	}
	defer release()

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if _, err := acquireQuickScanSlot(ctx); !errors.Is(err, context.DeadlineExceeded) {
		t.Errorf("a waiting scan should give up with its task, got %v", err)
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
