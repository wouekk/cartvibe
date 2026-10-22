package handlers

import (
	"net/http"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/utils"
	"strings"
	"testing"
)

func renameReceiptRequest(t *testing.T, receiptId uint, userId uint, body string) int {
	t.Helper()
	w, r := updateReceiptRequest(receiptId, userId, body)
	RenameReceipt(w, r)
	return w.Result().StatusCode
}

func storedReceiptName(t *testing.T, receiptId uint) string {
	t.Helper()
	var receipt models.Receipt
	if err := repositories.GetDB().Select("name").First(&receipt, receiptId).Error; err != nil {
		t.Fatalf("reload receipt: %v", err)
	}
	return receipt.Name
}

func TestRenameReceiptChangesOnlyTheName(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "rename-ok", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)

	status := renameReceiptRequest(t, receiptId, userId, `{"name":"  Weekly shop  "}`)
	if status != http.StatusOK {
		utils.PrintTestError(t, status, http.StatusOK)
	}
	if name := storedReceiptName(t, receiptId); name != "Weekly shop" {
		utils.PrintTestError(t, name, "Weekly shop")
	}

	var receipt models.Receipt
	repositories.GetDB().First(&receipt, receiptId)
	if receipt.GroupId != groupId || receipt.Status != models.OPEN {
		utils.PrintTestError(t, receipt, "group and status untouched")
	}
}

func TestRenameReceiptRejectsBlankAndOverlongNames(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "rename-bad", []string{permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate})
	receiptId := seedReceipt(t, groupId, userId)

	for _, body := range []string{`{"name":""}`, `{"name":"   "}`, `{"name":"` + strings.Repeat("x", 256) + `"}`, `{}`} {
		if status := renameReceiptRequest(t, receiptId, userId, body); status != http.StatusBadRequest {
			utils.PrintTestError(t, status, http.StatusBadRequest)
		}
	}
	if name := storedReceiptName(t, receiptId); name != "Existing" {
		utils.PrintTestError(t, name, "Existing")
	}
}

func TestRenameReceiptNeedsUpdatePermission(t *testing.T) {
	defer repositories.TruncateTestDb()
	userId, groupId := seedGroupWithRole(t, "rename-denied", []string{permissions.GroupReceiptsRead})
	receiptId := seedReceipt(t, groupId, userId)

	if status := renameReceiptRequest(t, receiptId, userId, `{"name":"Nope"}`); status != http.StatusForbidden {
		utils.PrintTestError(t, status, http.StatusForbidden)
	}
	if name := storedReceiptName(t, receiptId); name != "Existing" {
		utils.PrintTestError(t, name, "Existing")
	}
}
