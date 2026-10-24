package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"net/http"
	"testing"
)

func setReceiptAmountRequest(t *testing.T, receiptId uint, userId uint, body string) int {
	t.Helper()
	w, r := updateReceiptRequest(receiptId, userId, body)
	SetReceiptAmount(w, r)
	return w.Result().StatusCode
}

func storedReceipt(t *testing.T, receiptId uint) models.Receipt {
	t.Helper()
	var receipt models.Receipt
	if err := repositories.GetDB().First(&receipt, receiptId).Error; err != nil {
		t.Fatalf("reload receipt: %v", err)
	}
	return receipt
}

func TestSetReceiptAmountChangesOnlyTheTotal(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "amount-ok", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)
	before := storedReceipt(t, receiptId)

	if status := setReceiptAmountRequest(t, receiptId, userId, `{"amount":"85.00"}`); status != http.StatusOK {
		utils.PrintTestError(t, status, http.StatusOK)
	}

	after := storedReceipt(t, receiptId)
	if after.Amount.String() != "85" {
		utils.PrintTestError(t, after.Amount.String(), "85")
	}
	if after.Name != before.Name || after.Status != before.Status || after.GroupId != before.GroupId {
		utils.PrintTestError(t, after, "name, status and group untouched")
	}
}

func TestSetReceiptAmountRejectsMissingAndNonPositiveTotals(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "amount-bad", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)
	before := storedReceipt(t, receiptId).Amount

	for _, body := range []string{`{}`, `{"amount":"0"}`, `{"amount":"-5"}`} {
		if status := setReceiptAmountRequest(t, receiptId, userId, body); status != http.StatusBadRequest {
			utils.PrintTestError(t, status, http.StatusBadRequest)
		}
	}
	if after := storedReceipt(t, receiptId).Amount; !after.Equal(before) {
		utils.PrintTestError(t, after, before)
	}
}

func TestSetReceiptAmountRefusesAConvertedReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "amount-converted", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("original_currency", "PLN")
	before := storedReceipt(t, receiptId).Amount

	if status := setReceiptAmountRequest(t, receiptId, userId, `{"amount":"85.00"}`); status != http.StatusBadRequest {
		utils.PrintTestError(t, status, http.StatusBadRequest)
	}
	if after := storedReceipt(t, receiptId).Amount; !after.Equal(before) {
		utils.PrintTestError(t, after, before)
	}
}

func TestSetReceiptAmountNeedsUpdatePermission(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "amount-denied", []string{permissions.GroupReceiptsRead})
	receiptId := seedReceipt(t, groupId, userId)

	if status := setReceiptAmountRequest(t, receiptId, userId, `{"amount":"85.00"}`); status != http.StatusForbidden {
		utils.PrintTestError(t, status, http.StatusForbidden)
	}
}
