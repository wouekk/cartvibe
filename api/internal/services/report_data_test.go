package services

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/reporting/receiptsource"
	"cartvibe/api/internal/repositories"
	"strconv"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func loadCategory(t *testing.T, id uint) models.Category {
	t.Helper()
	var category models.Category
	if err := repositories.GetDB().First(&category, id).Error; err != nil {
		t.Fatalf("load category %d: %v", id, err)
	}
	return category
}

// createReportReceipt inserts a 100.00 receipt in a group with one product line
// per category, sharing the amount equally. Reports read categories off the
// lines, never the receipt.
func createReportReceipt(t *testing.T, name string, paidByUserId uint, groupId uint, categories []models.Category) models.Receipt {
	t.Helper()
	receipt := models.Receipt{
		Name:         name,
		Amount:       decimal.NewFromInt(100),
		Date:         time.Date(2026, 5, 15, 0, 0, 0, 0, time.UTC),
		PaidByUserID: paidByUserId,
		GroupId:      groupId,
		Status:       models.OPEN,
	}
	if err := repositories.GetDB().Create(&receipt).Error; err != nil {
		t.Fatalf("create receipt %q: %v", name, err)
	}
	for _, category := range categories {
		amount := decimal.NewFromInt(100).DivRound(decimal.NewFromInt(int64(len(categories))), 2)
		categoryId := category.ID
		line := models.ReceiptProduct{ReceiptId: receipt.ID, Name: category.Name, Amount: &amount, CategoryId: &categoryId}
		if err := repositories.GetDB().Create(&line).Error; err != nil {
			t.Fatalf("create line for %q: %v", name, err)
		}
	}
	return receipt
}

func groupIdString(groupId uint) string {
	return strconv.FormatUint(uint64(groupId), 10)
}

// A non-numeric group id cannot be resolved, so Rows fails fast rather than
// fetching against a bad scope.
func TestReportDataService_Rows_InvalidGroupIdReturnsError(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearRolePermissionCacheAll()

	userId, _, _ := seedHouseholdMember(t, "rpt-badid")

	catalog, rows, err := NewReportDataService(nil).Rows(userId, "not-a-number", commands.ReceiptPagedRequestFilter{})
	if err == nil {
		t.Fatalf("expected an error for a non-numeric group id, got none")
	}
	if rows != nil {
		t.Errorf("expected nil rows on error, got %d", len(rows))
	}
	if _, ok := catalog.Get(receiptsource.KeyAmount); ok {
		t.Errorf("expected an empty catalog on error")
	}
}

// Rows is NOT the group-membership boundary: it trusts that a caller was already
// authorized (the handler enforces group.reports.read before calling it, exactly
// as pie_chart.go does). A non-member therefore receives the group's rows, and a
// non-member's grants resolve as unrestricted. This test pins that boundary so
// the service is not mistaken for the gate, nor the gate accidentally moved here.
func TestReportDataService_Rows_DoesNotGateGroupMembership(t *testing.T) {
	defer repositories.TruncateTestDb()
	clearRolePermissionCacheAll()

	memberId, groupId, _ := seedHouseholdMember(t, "rpt-member")
	createReportReceipt(t, "r1", memberId, groupId, nil)
	createReportReceipt(t, "r2", memberId, groupId, nil)

	nonMemberId := makeUser(t, "rpt-outsider")

	_, rows, err := NewReportDataService(nil).Rows(nonMemberId, groupIdString(groupId), commands.ReceiptPagedRequestFilter{})
	if err != nil {
		t.Fatalf("Rows: %v", err)
	}
	if len(rows) != 2 {
		t.Errorf("expected the service to return the group's 2 rows to a non-member (membership is the handler's gate), got %d", len(rows))
	}
}
