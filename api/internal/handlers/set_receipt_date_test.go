package handlers

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"net/http"
	"testing"
	"time"
)

func setReceiptDateRequest(t *testing.T, receiptId uint, userId uint, body string) int {
	t.Helper()
	w, r := updateReceiptRequest(receiptId, userId, body)
	SetReceiptDate(w, r)
	return w.Result().StatusCode
}

func TestSetReceiptDateChangesOnlyTheDateOfASettledReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "date-ok", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("status", models.RESOLVED)
	before := storedReceipt(t, receiptId)

	if status := setReceiptDateRequest(t, receiptId, userId, `{"date":"2026-10-21"}`); status != http.StatusOK {
		utils.PrintTestError(t, status, http.StatusOK)
	}

	after := storedReceipt(t, receiptId)
	want := time.Date(2026, 10, 21, 0, 0, 0, 0, time.UTC)
	if !after.Date.Equal(want) {
		utils.PrintTestError(t, after.Date, want)
	}
	if after.Name != before.Name || after.Status != models.RESOLVED || !after.Amount.Equal(before.Amount) {
		utils.PrintTestError(t, after, "name, status and amount untouched")
	}
}

func TestSetReceiptDateRejectsMissingAndMalformedDays(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "date-bad", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)
	before := storedReceipt(t, receiptId).Date

	for _, body := range []string{`{}`, `{"date":""}`, `{"date":"21/10/2026"}`, `{"date":"2026-02-30"}`} {
		if status := setReceiptDateRequest(t, receiptId, userId, body); status != http.StatusBadRequest {
			utils.PrintTestError(t, status, http.StatusBadRequest)
		}
	}
	if after := storedReceipt(t, receiptId).Date; !after.Equal(before) {
		utils.PrintTestError(t, after, before)
	}
}

func TestSetReceiptDateRefusesAConvertedReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "date-converted", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receiptId).Update("original_currency", "PLN")

	if status := setReceiptDateRequest(t, receiptId, userId, `{"date":"2026-10-21"}`); status != http.StatusBadRequest {
		utils.PrintTestError(t, status, http.StatusBadRequest)
	}
}

func TestSetReceiptDateNeedsUpdatePermission(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "date-denied", []string{permissions.GroupReceiptsRead})
	receiptId := seedReceipt(t, groupId, userId)

	if status := setReceiptDateRequest(t, receiptId, userId, `{"date":"2026-10-21"}`); status != http.StatusForbidden {
		utils.PrintTestError(t, status, http.StatusForbidden)
	}
}
