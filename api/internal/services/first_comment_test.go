package services

import (
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	"github.com/shopspring/decimal"
)

var firstCommentTestTime = time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)

func seedFirstCommentReceipt(t *testing.T, groupId uint, payerId uint, name string) models.Receipt {
	t.Helper()
	receipt := models.Receipt{
		Name:         name,
		Amount:       decimal.NewFromInt(1),
		Date:         time.Now(),
		PaidByUserID: payerId,
		GroupId:      groupId,
		Status:       models.OPEN,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("seed receipt: %v", err)
	}
	return receipt
}

// seedCommentAt stamps created_at so "first" is decided by time, not insertion order.
func seedCommentAt(t *testing.T, receiptId uint, userId *uint, text string, createdAt time.Time) {
	t.Helper()
	db := repositories.GetDB()
	comment := models.Comment{Comment: text, ReceiptId: receiptId, UserId: userId}
	if err := db.Create(&comment).Error; err != nil {
		t.Fatalf("seed comment: %v", err)
	}
	if err := db.Model(&comment).Update("created_at", createdAt).Error; err != nil {
		t.Fatalf("stamp comment: %v", err)
	}
}

func firstCommentOf(receipt models.Receipt) string {
	if receipt.FirstComment == nil {
		return "<nil>"
	}
	return *receipt.FirstComment
}

func TestLoadFirstComments_PicksTheEarliestComment(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearRolePermissionCacheAll()

	fx := seedHousehold(t)
	service := NewPermissionService(nil)

	commented := seedFirstCommentReceipt(t, fx.groupId, fx.ownerId, "commented")
	seedCommentAt(t, commented.ID, &fx.memberAId, "second", firstCommentTestTime.Add(time.Hour))
	seedCommentAt(t, commented.ID, &fx.memberBId, "first", firstCommentTestTime)
	bare := seedFirstCommentReceipt(t, fx.groupId, fx.ownerId, "bare")

	// Whoever wrote it: the earliest comment is the first one.
	receipts := []models.Receipt{commented, bare}
	if err := service.LoadFirstComments(receipts); err != nil {
		t.Fatalf("load: %v", err)
	}

	if got := firstCommentOf(receipts[0]); got != "first" {
		t.Errorf("expected the earliest comment, got %q", got)
	}
	if receipts[1].FirstComment != nil {
		t.Errorf("expected no first comment on a receipt without comments, got %q", *receipts[1].FirstComment)
	}
}

func TestLoadFirstComments_EmptyBatchIsANoop(t *testing.T) {
	service := NewPermissionService(nil)
	if err := service.LoadFirstComments(nil); err != nil {
		t.Fatalf("expected no error for an empty batch, got %v", err)
	}
}
