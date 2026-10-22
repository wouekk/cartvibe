package handlers

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/utils"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/go-chi/chi/v5"
)

func TestResolveQuickScanStatus(t *testing.T) {
	cases := []struct {
		name     string
		tasks    []models.SystemTask
		expected QuickScanStatusResult
	}{
		{"no tasks yet is pending", nil, QuickScanStatusResult{Status: "PENDING"}},
		{
			"a task linked to a receipt is done",
			[]models.SystemTask{{Status: models.SYSTEM_TASK_SUCCEEDED}, {Status: models.SYSTEM_TASK_SUCCEEDED, ReceiptId: uintPtr(7)}},
			QuickScanStatusResult{Status: "DONE", ReceiptId: 7},
		},
		{
			"a failed task without a receipt is failed",
			[]models.SystemTask{{Status: models.SYSTEM_TASK_FAILED}},
			QuickScanStatusResult{Status: "FAILED"},
		},
		{
			"a receipt wins over an earlier failed attempt",
			[]models.SystemTask{{Status: models.SYSTEM_TASK_FAILED}, {Status: models.SYSTEM_TASK_SUCCEEDED, ReceiptId: uintPtr(9)}},
			QuickScanStatusResult{Status: "DONE", ReceiptId: 9},
		},
		{
			"a succeeded task with no receipt yet is pending",
			[]models.SystemTask{{Status: models.SYSTEM_TASK_SUCCEEDED}},
			QuickScanStatusResult{Status: "PENDING"},
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			actual := resolveQuickScanStatus(c.tasks)
			if actual != c.expected {
				utils.PrintTestError(t, actual, c.expected)
			}
		})
	}
}

func quickScanStatusRequest(userId uint, taskId string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", "/api/receipt/quickScan/"+taskId, nil)
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(userId)))
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("taskId", taskId)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, routeContext))

	GetQuickScanStatus(w, r)
	return w
}

func TestGetQuickScanStatusOnlyAnswersForTheUserWhoRanTheScan(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestUser()

	owner := uint(1)
	task := models.SystemTask{
		Type:                 models.QUICK_SCAN,
		AssociatedEntityType: models.RECEIPT_PROCESSING_SETTINGS,
		Status:               models.SYSTEM_TASK_SUCCEEDED,
		StartedAt:            time.Now(),
		RanByUserId:          &owner,
		ReceiptId:            uintPtr(42),
		AsynqTaskId:          "task-abc",
	}
	if err := repositories.GetDB().Create(&task).Error; err != nil {
		t.Fatalf("seed task: %v", err)
	}

	read := func(w *httptest.ResponseRecorder) QuickScanStatusResult {
		var result QuickScanStatusResult
		if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
			t.Fatalf("decode: %v (%s)", err, w.Body.String())
		}
		return result
	}

	own := quickScanStatusRequest(owner, "task-abc")
	if own.Result().StatusCode != 200 {
		utils.PrintTestError(t, own.Result().StatusCode, 200)
	}
	if got := read(own); got.Status != "DONE" || got.ReceiptId != 42 {
		utils.PrintTestError(t, got, QuickScanStatusResult{Status: "DONE", ReceiptId: 42})
	}

	other := quickScanStatusRequest(owner+1, "task-abc")
	if got := read(other); got.Status != "PENDING" || got.ReceiptId != 0 {
		utils.PrintTestError(t, got, QuickScanStatusResult{Status: "PENDING"})
	}

	unknown := quickScanStatusRequest(owner, "does-not-exist")
	if got := read(unknown); got.Status != "PENDING" {
		utils.PrintTestError(t, got, QuickScanStatusResult{Status: "PENDING"})
	}
}
