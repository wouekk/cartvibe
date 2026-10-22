package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"strings"
	"testing"

)

// These tests exercise the full "AI response -> created receipt" path: a controlled AI JSON body is
// fed through the real ReceiptService.QuickScan (the only place an AI response reaches CreateReceipt)
// and the persisted receipt is read back through the deep-preload GetFullyLoadedReceiptById to prove
// that every field survives - name, amount, date, paid-by, status, categories, tags,
// comments,
// and custom-field values of all five value types. If a future prompt starts emitting these fields,
// these tests prove the plumbing already persists them; a regression that silently drops a field
// fails here.
//
// The AI is mocked at the HTTP transport layer (see ai_test.go) via a server whose body is set AFTER
// the pipeline is seeded, so fixtures can reference the seeded user's real id without guessing.

// newMutableOllamaServer serves whatever *body points at, at request time. Unlike
// newMockOllamaServerForService (fixed body) this lets a test seed the graph first, learn the seeded
// user's id, then set the AI response referencing that id - the request only fires later, inside
// QuickScan.
func newMutableOllamaServer(t *testing.T, body *string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Read the whole request first: answering before the client has finished writing a large image
		// body makes its write fail with a broken pipe, which was the source of flaky quick scan tests.
		_, _ = io.Copy(io.Discard, r.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(*body))
	}))
	t.Cleanup(server.Close)
	return server
}

// ollamaReceiptResponse wraps a receipt JSON string as the message.content of an Ollama chat
// response, JSON-escaping it so quotes/newlines in the receipt JSON can't break the envelope.
func ollamaReceiptResponse(t *testing.T, receiptJSON string) string {
	t.Helper()
	envelope := map[string]any{
		"model":      "test",
		"created_at": "2024-01-01T00:00:00Z",
		"message":    map[string]any{"role": "assistant", "content": receiptJSON},
		"done":       true,
	}
	bytes, err := json.Marshal(envelope)
	if err != nil {
		t.Fatalf("marshal ollama envelope: %v", err)
	}
	return string(bytes)
}

// writeQuickScanTempFile writes the shared JPG fixture to a temp file and returns its path, mirroring
// what handlers.QuickScan hands ReceiptService.QuickScan.
func writeQuickScanTempFile(t *testing.T) string {
	t.Helper()
	jpg, err := os.ReadFile(filepath.Join(testApiRoot(), "testing", "test.jpg"))
	if err != nil {
		t.Fatalf("read jpg fixture: %v", err)
	}
	path, err := repositories.NewFileRepository(nil).WriteTempFile(jpg)
	if err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	t.Cleanup(func() { os.Remove(path) })
	return path
}


// runQuickScan seeds the receipt-image pipeline + categories (ids 1-3) + tags (ids 1-2), points a
// mock AI at the JSON built from the seeded user/group, and drives ReceiptService.QuickScan. The
// aiJSONFor callback runs after seeding so it can reference the seeded user's real id; paidByArg is
// the QuickScan paid-by argument (the handler-resolved default), resolved from the seeded user too.
func runQuickScan(
	t *testing.T,
	paidByArg func(user models.User) uint,
	status models.ReceiptStatus,
	categoryPicks []uint,
	tagPicks []uint,
	aiJSONFor func(user models.User, group models.Group) string,
) (models.Receipt, models.User, models.Group, error) {
	return runQuickScanWithSetup(t, paidByArg, status, categoryPicks, tagPicks, "", aiJSONFor, nil)
}

// runQuickScanWithSetup is runQuickScan with the user's quick-scan comment (the handler-resolved
// value; empty for none) and an optional postSeed hook that runs after the pipeline +
// categories/tags are seeded and before the AI body is set - so a test can, e.g., assign the seeded
// member a grant-restricted group role to exercise the out-of-grant drop.
func runQuickScanWithSetup(
	t *testing.T,
	paidByArg func(user models.User) uint,
	status models.ReceiptStatus,
	categoryPicks []uint,
	tagPicks []uint,
	comment string,
	aiJSONFor func(user models.User, group models.Group) string,
	postSeed func(t *testing.T, user models.User, group models.Group),
) (models.Receipt, models.User, models.Group, error) {
	t.Helper()

	var body string
	server := newMutableOllamaServer(t, &body)
	user, group, _ := seedReceiptImagePipeline(t, server.URL)
	repositories.CreateTestCategories()
	createTestTags()

	if postSeed != nil {
		postSeed(t, user, group)
	}

	body = ollamaReceiptResponse(t, aiJSONFor(user, group))
	tempPath := writeQuickScanTempFile(t)

	paidBy := uint(0)
	if paidByArg != nil {
		paidBy = paidByArg(user)
	}

	receipt, err := NewReceiptService(nil).QuickScan(QuickScanParams{
		Token:            &structs.Claims{UserId: user.ID},
		PaidByUserId:     paidBy,
		GroupId:          group.ID,
		Status:           status,
		CategoryIds:      categoryPicks,
		TagIds:           tagPicks,
		Comment:          comment,
		TempPath:         tempPath,
		OriginalFileName: "test.jpg",
		AsynqTaskId:      "test-task",
	})
	return receipt, user, group, err
}

func hasCategoryId(categories []models.Category, id uint) bool {
	for _, category := range categories {
		if category.ID == id {
			return true
		}
	}
	return false
}

func hasTagId(tags []models.Tag, id uint) bool {
	for _, tag := range tags {
		if tag.ID == id {
			return true
		}
	}
	return false
}

// TestQuickScan_BackfillsPaidByAndStatusWhenAiOmitsThem proves QuickScan fills the paid-by/status
// from its arguments (the group's resolved defaults) when the AI omits them.
func TestQuickScan_BackfillsPaidByAndStatusWhenAiOmitsThem(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, user, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID }, // handler-resolved default paid-by
		models.NEEDS_ATTENTION,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			return `{"name": "No Payer", "amount": 12.50, "date": "2024-03-03T00:00:00Z"}`
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if receipt.PaidByUserID != user.ID {
		utils.PrintTestError(t, receipt.PaidByUserID, user.ID)
	}
	if receipt.Status != models.NEEDS_ATTENTION {
		utils.PrintTestError(t, receipt.Status, models.NEEDS_ATTENTION)
	}
}

// TestQuickScan_KeepsAiPaidByAndStatusWhenPresent proves an AI-supplied paid-by/status is not
// overwritten by the QuickScan default arguments.
func TestQuickScan_KeepsAiPaidByAndStatusWhenPresent(t *testing.T) {
	defer repositories.TruncateTestDb()

	var aiPayerId uint
	created, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID }, // default paid-by (should be ignored)
		models.OPEN,                              // default status (should be ignored)
		nil,
		nil,
		func(u models.User, g models.Group) string {
			// A second, distinct user for the AI paid-by so the assertion fails if
			// QuickScan drops the AI value and falls back to the default arg (the
			// seeded user). Same-user ids would pass either way.
			aiPayer := models.User{Username: "ai-payer", Password: "p", DisplayName: "x"}
			if err := repositories.GetDB().Create(&aiPayer).Error; err != nil {
				t.Fatalf("seed ai payer: %v", err)
			}
			aiPayerId = aiPayer.ID
			return fmt.Sprintf(
				`{"name": "Has Payer", "amount": 5.00, "date": "2024-02-02T00:00:00Z", "paidByUserId": %d, "status": "RESOLVED"}`,
				aiPayer.ID,
			)
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if receipt.PaidByUserID != aiPayerId {
		utils.PrintTestError(t, receipt.PaidByUserID, aiPayerId)
	}
	if receipt.Status != models.RESOLVED {
		utils.PrintTestError(t, receipt.Status, models.RESOLVED)
	}
}

// TestQuickScan_MergesUserCategoryAndTagPicksWithAi proves the user's per-file category/tag picks are
// unioned (deduped by id) with the AI-assigned ones, with names resolved so validation passes.
func TestQuickScan_MergesUserCategoryAndTagPicksWithAi(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		[]uint{2, 3}, // user category picks
		[]uint{2},    // user tag pick
		func(u models.User, g models.Group) string {
			// AI assigns category 1 and tag 1 (with names, as required by validation).
			return `{"name": "Merge", "amount": 9.99, "date": "2024-01-01T00:00:00Z", "categories": [{"id": 1, "name": "test"}], "tags": [{"id": 1, "name": "tag-a"}]}`
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if len(receipt.Categories) != 3 ||
		!hasCategoryId(receipt.Categories, 1) ||
		!hasCategoryId(receipt.Categories, 2) ||
		!hasCategoryId(receipt.Categories, 3) {
		utils.PrintTestError(t, receipt.Categories, "categories 1,2,3 unioned")
	}
	// The person's tag is kept; the AI's is dropped (tags are people's own labels).
	if len(receipt.Tags) != 1 || !hasTagId(receipt.Tags, 2) {
		utils.PrintTestError(t, receipt.Tags, "only the person's tag 2")
	}
}

// TestQuickScan_InvalidAiJsonReturnsError proves a non-JSON AI response surfaces as an error from
// QuickScan and persists nothing.
func TestQuickScan_InvalidAiJsonReturnsError(t *testing.T) {
	defer repositories.TruncateTestDb()

	_, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			return `this is not json`
		},
	)
	if err == nil {
		utils.PrintTestError(t, nil, "a JSON parse error")
	}

	if count := quickScanCreatedReceiptCount(); count != 0 {
		utils.PrintTestError(t, count, int64(0))
	}
}

// TestQuickScan_ResolvesIdOnlyAiCategory covers the quick-scan bug: the default prompt tells the AI to
// return categories/tags by id only (no name), which previously failed receipt validation ("name is
// required") and silently dropped the whole receipt. QuickScan now resolves each id to its real record
// so the receipt is created with the name filled in.
func TestQuickScan_ResolvesIdOnlyAiCategory(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			// Category/tag by id only - the exact shape the default prompt produces.
			return `{"name": "Walmart", "amount": 98.21, "date": "2024-01-01T00:00:00Z", "categories": [{"id": 1}], "tags": [{"id": 1}]}`
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if len(receipt.Categories) != 1 || !hasCategoryId(receipt.Categories, 1) {
		utils.PrintTestError(t, receipt.Categories, "category 1 resolved")
		return
	}
	if receipt.Categories[0].Name != "test" {
		utils.PrintTestError(t, receipt.Categories[0].Name, "test")
	}
	// The AI's tag is dropped: tags are people's own labels.
	if len(receipt.Tags) != 0 {
		utils.PrintTestError(t, receipt.Tags, "no tags from the AI")
	}
}

// TestQuickScan_DropsUnresolvableAiCategory proves a hallucinated AI category id (no matching row) is
// dropped rather than failing the whole scan.
func TestQuickScan_DropsUnresolvableAiCategory(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			return `{"name": "Junk", "amount": 5.00, "date": "2024-01-01T00:00:00Z", "categories": [{"id": 1}, {"id": 999}]}`
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if len(receipt.Categories) != 1 || !hasCategoryId(receipt.Categories, 1) {
		utils.PrintTestError(t, receipt.Categories, "only category 1 (999 dropped)")
	}
}

// TestQuickScan_DropsOutOfGrantAiCategory proves an AI-assigned category the triggering user isn't
// allowed to see (their group role grants only a subset) is dropped, matching the write-side grant
// enforcement.
func TestQuickScan_DropsOutOfGrantAiCategory(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScanWithSetup(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		"",
		func(u models.User, g models.Group) string {
			// AI assigns categories 1 and 2; the user's role grants only category 1.
			return `{"name": "Restricted", "amount": 7.00, "date": "2024-01-01T00:00:00Z", "categories": [{"id": 1}, {"id": 2}]}`
		},
		func(t *testing.T, user models.User, group models.Group) {
			clearGroupRoleGrantCacheAll()
			clearRolePermissionCacheAll()
			role, err := repositories.NewRoleRepository(nil).CreateGroupRole(
				"restricted-cat", "", []string{permissions.GroupReceiptsRead}, []uint{1}, nil, nil, false, false)
			if err != nil {
				t.Fatalf("create restricted role: %v", err)
			}
			if err := repositories.GetDB().Model(&models.GroupMember{}).
				Where("group_id = ? AND user_id = ?", group.ID, user.ID).
				Update("group_role_id", role.ID).Error; err != nil {
				t.Fatalf("assign role to member: %v", err)
			}
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if len(receipt.Categories) != 1 || !hasCategoryId(receipt.Categories, 1) {
		utils.PrintTestError(t, receipt.Categories, "only category 1 (2 out-of-grant dropped)")
	}
}

// TestQuickScan_DropsMemberOutOfGrantAiCategory is the member-layer twin of
// TestQuickScan_DropsOutOfGrantAiCategory: the AI candidate filter resolves through the same
// GetGroupCategoryIdsForUser, so a category the ROLE allows but the member's own assignment does
// not must still be dropped. Without this, quick scan would silently attach a child to a foster
// parent's receipt that they were never assigned.
func TestQuickScan_DropsMemberOutOfGrantAiCategory(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScanWithSetup(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		"",
		func(u models.User, g models.Group) string {
			// AI assigns categories 1 and 2; the ROLE allows both, the MEMBER only 1.
			return `{"name": "MemberRestricted", "amount": 7.00, "date": "2024-01-01T00:00:00Z", "categories": [{"id": 1}, {"id": 2}]}`
		},
		func(t *testing.T, user models.User, group models.Group) {
			clearGroupRoleGrantCacheAll()
			clearRolePermissionCacheAll()
			role, err := repositories.NewRoleRepository(nil).CreateGroupRole(
				"member-restricted-cat", "", []string{permissions.GroupReceiptsRead}, []uint{1, 2}, nil, nil, false, false)
			if err != nil {
				t.Fatalf("create role: %v", err)
			}
			if err := repositories.GetDB().Model(&models.GroupMember{}).
				Where("group_id = ? AND user_id = ?", group.ID, user.ID).
				Update("group_role_id", role.ID).Error; err != nil {
				t.Fatalf("assign role to member: %v", err)
			}
			err = repositories.NewGroupMemberRepository(nil).
				ReplaceMemberGrants(user.ID, group.ID, []uint{1}, nil)
			if err != nil {
				t.Fatalf("assign member grants: %v", err)
			}
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if len(receipt.Categories) != 1 || !hasCategoryId(receipt.Categories, 1) {
		utils.PrintTestError(t, receipt.Categories, "only category 1 (2 dropped by the member assignment)")
	}
}

// TestQuickScan_ValidationFailureRecordsFailedSystemTask covers the "missing system task" gap: a
// failure AFTER AI processing succeeds but BEFORE the receipt is created (here receipt validation) used
// to vanish into the log, leaving the AI tasks marked SUCCEEDED and no record of why no receipt
// appeared. The AI JSON parses (so the QUICK_SCAN task is SUCCEEDED), then fails validation (no name);
// QuickScan now records a FAILED RECEIPT_UPLOADED task and flips the QUICK_SCAN parent to FAILED.
func TestQuickScan_ValidationFailureRecordsFailedSystemTask(t *testing.T) {
	defer repositories.TruncateTestDb()

	_, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			// Parses fine (QUICK_SCAN succeeds) but has no name -> validation fails after AI processing.
			return `{"amount": 12.34, "date": "2024-01-01T00:00:00Z"}`
		},
	)
	if err == nil {
		utils.PrintTestError(t, nil, "a validation error")
	}
	if count := quickScanCreatedReceiptCount(); count != 0 {
		utils.PrintTestError(t, count, int64(0))
	}

	// The QUICK_SCAN parent must be flipped to FAILED - this is what the activity feed shows.
	parent, ok := quickScanSystemTaskByType(models.QUICK_SCAN)
	if !ok {
		utils.PrintTestError(t, "no QUICK_SCAN task", "a QUICK_SCAN task")
		return
	}
	if parent.Status != models.SYSTEM_TASK_FAILED {
		utils.PrintTestError(t, parent.Status, models.SYSTEM_TASK_FAILED)
	}

	// A FAILED RECEIPT_UPLOADED task carrying the validation error must be recorded, attributed to the
	// real group.
	uploaded, ok := quickScanSystemTaskByType(models.RECEIPT_UPLOADED)
	if !ok {
		utils.PrintTestError(t, "no RECEIPT_UPLOADED task", "a FAILED RECEIPT_UPLOADED task")
		return
	}
	if uploaded.Status != models.SYSTEM_TASK_FAILED {
		utils.PrintTestError(t, uploaded.Status, models.SYSTEM_TASK_FAILED)
	}
	if !strings.Contains(uploaded.ResultDescription, "validation failed") {
		utils.PrintTestError(t, uploaded.ResultDescription, "contains 'validation failed'")
	}
	if uploaded.GroupId == nil || *uploaded.GroupId == 0 {
		utils.PrintTestError(t, uploaded.GroupId, "the real group id")
	}
}

// TestCombineEarlyFailureErrors pins the pre-transaction failure-wrapping used by
// recordEarlyQuickScanFailure: when system-task recording itself fails, both the original failure and
// the recording error must stay reachable via errors.Is (the recording error is wrapped, not just
// string-interpolated), with the original failure leading.
func TestCombineEarlyFailureErrors(t *testing.T) {
	failureErr := errors.New("receipt validation failed")
	taskErr := errors.New("system task write failed")

	// No recording error: the original failure passes through unchanged.
	if got := combineEarlyFailureErrors(failureErr, nil); got != failureErr {
		utils.PrintTestError(t, got, failureErr)
	}

	// Both errors stay reachable via errors.Is, with failureErr's message leading.
	combined := combineEarlyFailureErrors(failureErr, taskErr)
	if !errors.Is(combined, failureErr) {
		utils.PrintTestError(t, combined, "errors.Is finds failureErr")
	}
	if !errors.Is(combined, taskErr) {
		utils.PrintTestError(t, combined, "errors.Is finds taskErr")
	}
	if !strings.Contains(combined.Error(), "receipt validation failed") {
		utils.PrintTestError(t, combined.Error(), "message leads with the original failure")
	}
}

// quickScanCreatedReceiptCount counts receipts written through CreateReceipt (which stamps
// created_by), excluding the pipeline's seeded baseline receipt (created_by NULL). It is the "nothing
// was persisted" probe for the failure-path tests.
func quickScanCreatedReceiptCount() int64 {
	var count int64
	repositories.GetDB().Model(&models.Receipt{}).Where("created_by IS NOT NULL").Count(&count)
	return count
}

// quickScanSystemTaskByType fetches the single system task of the given type written by a runQuickScan
// call (all carry asynqTaskId "test-task"). Returns false when none exists.
func quickScanSystemTaskByType(taskType models.SystemTaskType) (models.SystemTask, bool) {
	var task models.SystemTask
	err := repositories.GetDB().
		Where("asynq_task_id = ? AND type = ?", "test-task", taskType).
		First(&task).Error
	if err != nil {
		return models.SystemTask{}, false
	}
	return task, true
}

// The user's quick-scan comment is persisted against the caller, attached to the receipt created by
// the same transaction (UpsertCommentCommand.Validate requires a non-nil UserId, so a regression
// that drops it would fail the whole receipt rather than just the comment).
func TestQuickScan_PersistsUserComment(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, user, _, err := runQuickScanWithSetup(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		"Team lunch, split later",
		func(u models.User, g models.Group) string {
			return `{"name": "Bare", "amount": 1.00, "date": "2024-07-07T00:00:00Z"}`
		},
		nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	if len(receipt.Comments) != 1 {
		utils.PrintTestError(t, len(receipt.Comments), 1)
		return
	}
	if receipt.Comments[0].Comment != "Team lunch, split later" {
		utils.PrintTestError(t, receipt.Comments[0].Comment, "Team lunch, split later")
	}
	if receipt.Comments[0].UserId == nil || *receipt.Comments[0].UserId != user.ID {
		utils.PrintTestError(t, receipt.Comments[0].UserId, user.ID)
	}
}

// An empty comment adds nothing - the default (hidden) config sends no comment, and that must not
// create a blank one.
func TestQuickScan_EmptyCommentAddsNothing(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, _, _, err := runQuickScan(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		func(u models.User, g models.Group) string {
			return `{"name": "Bare", "amount": 1.00, "date": "2024-07-07T00:00:00Z"}`
		},
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}
	if len(receipt.Comments) != 0 {
		utils.PrintTestError(t, len(receipt.Comments), 0)
	}
}

// The user's comment is APPENDED to whatever the AI produced, never replacing it: a group running a
// custom prompt that emits comments must not lose them to a quick-scan comment.
func TestQuickScan_AppendsUserCommentToAiComment(t *testing.T) {
	defer repositories.TruncateTestDb()

	created, user, _, err := runQuickScanWithSetup(
		t,
		func(u models.User) uint { return u.ID },
		models.OPEN,
		nil,
		nil,
		"User note",
		func(u models.User, g models.Group) string {
			return fmt.Sprintf(
				`{"name": "Both", "amount": 5.00, "date": "2024-07-07T00:00:00Z", "comments": [{"comment": "AI note", "userId": %d}]}`,
				u.ID)
		},
		nil,
	)
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	receipt, err := repositories.NewReceiptRepository(nil).GetFullyLoadedReceiptById(utils.UintToString(created.ID))
	if err != nil {
		utils.PrintTestError(t, err, "no error")
		return
	}

	if len(receipt.Comments) != 2 {
		utils.PrintTestError(t, len(receipt.Comments), 2)
		return
	}

	found := map[string]bool{}
	for _, comment := range receipt.Comments {
		found[comment.Comment] = true
		if comment.UserId == nil || *comment.UserId != user.ID {
			utils.PrintTestError(t, comment.UserId, user.ID)
		}
	}
	if !found["AI note"] || !found["User note"] {
		utils.PrintTestError(t, found, "both the AI comment and the user comment")
	}
}

