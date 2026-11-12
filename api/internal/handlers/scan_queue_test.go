package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"cartvibe/api/internal/jobs"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/go-chi/chi/v5"
)

// scanQueueFixture is two households: the admin and a member are in the first, the outsider in the second.
type scanQueueFixture struct {
	group, otherGroup       uint
	admin, member, outsider uint
	tempDir                 string
}

func seedScanQueueFixture(t *testing.T) scanQueueFixture {
	t.Helper()
	db := repositories.GetDB()

	// The uploads live in temp/ under BASE_PATH, as on a server.
	base := t.TempDir()
	tempDir := filepath.Join(base, "temp")
	if err := os.MkdirAll(tempDir, 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("BASE_PATH", base)

	fixture := scanQueueFixture{admin: 1, member: 2, outsider: 3, tempDir: tempDir}
	for _, name := range []string{"scan-queue-home", "scan-queue-other"} {
		group := models.Group{Name: name}
		if err := db.Create(&group).Error; err != nil {
			t.Fatal(err)
		}
		if fixture.group == 0 {
			fixture.group = group.ID
		} else {
			fixture.otherGroup = group.ID
		}
	}

	grantAppPerms(t, fixture.admin, permissions.AppReceiptProcessingSettingsRead)
	for _, userId := range []uint{fixture.member, fixture.outsider} {
		user := models.User{BaseModel: models.BaseModel{ID: userId}, Username: "scan-queue-" + utils.UintToString(userId), Password: "password"}
		if err := db.Create(&user).Error; err != nil {
			t.Fatal(err)
		}
	}

	everything := []string{
		permissions.GroupReceiptsRead, permissions.GroupReceiptsUpdate,
		permissions.GroupActivitiesRead, permissions.GroupActivitiesRerun,
	}
	grantGroupPerms(t, fixture.admin, fixture.group, everything...)
	grantGroupPerms(t, fixture.member, fixture.group, everything...)
	grantGroupPerms(t, fixture.outsider, fixture.otherGroup, everything...)

	return fixture
}

// queueScan stores a quick scan job for a household, with its upload on disk unless fileName is empty.
func (fixture scanQueueFixture) queueScan(t *testing.T, groupId uint, uploader uint, fileName string) models.Job {
	t.Helper()

	path := ""
	if fileName != "" {
		path = filepath.Join(fixture.tempDir, fileName)
		if err := os.WriteFile(path, []byte("photo"), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	payload, err := json.Marshal(jobs.QuickScanTaskPayload{
		Token:            &structs.Claims{UserId: uploader},
		GroupId:          groupId,
		TempPath:         path,
		OriginalFileName: fileName,
	})
	if err != nil {
		t.Fatal(err)
	}

	job, err := repositories.NewJobRepository(nil).Enqueue(jobs.QuickScan, string(payload), 4, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	return job
}

func scanQueueRequest(method string, userId uint, id string) (*httptest.ResponseRecorder, *http.Request) {
	w := httptest.NewRecorder()
	r := httptest.NewRequest(method, "/api/scanQueue", nil)

	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("id", id)
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, routeContext))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(userId)))

	return w, r
}

func TestScanQueueIsForWhoeverMayOpenTheAiPage(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedScanQueueFixture(t)

	w, r := scanQueueRequest("GET", fixture.member, "")
	GetScanQueue(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("a member without the AI page's permission gets 403, got %d", w.Result().StatusCode)
	}
}

func TestScanQueueListsTheScansAndTheUnreadReceipts(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedScanQueueFixture(t)
	db := repositories.GetDB()
	jobRepository := repositories.NewJobRepository(nil)
	now := time.Now()

	waiting := fixture.queueScan(t, fixture.group, fixture.member, "waiting.jpg")
	retrying := fixture.queueScan(t, fixture.group, fixture.member, "retrying.jpg")
	retryAt := now.Add(time.Minute)
	if err := jobRepository.Fail(retrying.ID, "the provider answered 503", &retryAt, now); err != nil {
		t.Fatal(err)
	}
	failed := fixture.queueScan(t, fixture.group, fixture.admin, "failed.jpg")
	if err := jobRepository.Fail(failed.ID, "no such table", nil, now); err != nil {
		t.Fatal(err)
	}
	// A failed scan of a household the admin is not in: listed, with no button that would answer 403.
	foreign := fixture.queueScan(t, fixture.otherGroup, fixture.outsider, "foreign.jpg")
	if err := jobRepository.Fail(foreign.ID, "no such table", nil, now); err != nil {
		t.Fatal(err)
	}

	receipts := map[string]models.ReceiptProductExtractionStatus{
		"Read":      models.PRODUCT_EXTRACTION_DONE,
		"Waits":     models.PRODUCT_EXTRACTION_PENDING,
		"Given up":  models.PRODUCT_EXTRACTION_FAILED,
		"No signal": models.PRODUCT_EXTRACTION_UNAVAILABLE,
	}
	for name, status := range receipts {
		receipt := models.Receipt{Name: name, GroupId: fixture.group, PaidByUserID: fixture.member, Date: now}
		if err := db.Create(&receipt).Error; err != nil {
			t.Fatal(err)
		}
		extraction := models.ReceiptProductExtraction{ReceiptId: receipt.ID, Status: status, NextAttemptAt: now, LastError: "why " + name}
		if err := db.Create(&extraction).Error; err != nil {
			t.Fatal(err)
		}
	}

	w, r := scanQueueRequest("GET", fixture.admin, "")
	GetScanQueue(w, r)
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("status %d: %s", w.Result().StatusCode, w.Body.String())
	}

	var queue structs.ScanQueue
	if err := json.Unmarshal(w.Body.Bytes(), &queue); err != nil {
		t.Fatal(err)
	}

	if len(queue.Scans) != 4 {
		t.Fatalf("four scans, oldest first, got %+v", queue.Scans)
	}
	byId := map[uint]structs.ScanQueueScan{}
	for _, scan := range queue.Scans {
		byId[scan.Id] = scan
	}
	if scan := byId[waiting.ID]; scan.Status != structs.ScanWaiting || scan.FileName != "waiting.jpg" ||
		scan.UploadedByUserId != fixture.member || scan.GroupId != fixture.group || !scan.HasFile || scan.CanRerun || scan.NextAttemptAt != nil {
		t.Errorf("the waiting scan: %+v", scan)
	}
	if scan := byId[retrying.ID]; scan.Status != structs.ScanRetrying || scan.Attempts != 1 || scan.MaxAttempts != 4 ||
		scan.NextAttemptAt == nil || scan.LastError != "the provider answered 503" || scan.CanRerun {
		t.Errorf("the scan between tries: %+v", scan)
	}
	if scan := byId[failed.ID]; scan.Status != structs.ScanFailed || !scan.CanRerun || !scan.HasFile {
		t.Errorf("the failed scan can be run again and opened: %+v", scan)
	}
	if scan := byId[foreign.ID]; scan.Status != structs.ScanFailed || scan.CanRerun || scan.HasFile {
		t.Errorf("another household's scan is listed without buttons: %+v", scan)
	}

	if queue.UnreadReceiptCount != 3 || len(queue.UnreadReceipts) != 3 {
		t.Fatalf("three receipts are without a read: %d, %+v", queue.UnreadReceiptCount, queue.UnreadReceipts)
	}
	for _, receipt := range queue.UnreadReceipts {
		want, known := receipts[receipt.Name]
		if !known || receipt.Status != string(want) || receipt.Status == string(models.PRODUCT_EXTRACTION_DONE) {
			t.Errorf("unexpected unread receipt: %+v", receipt)
		}
		if receipt.GroupId != fixture.group || receipt.LastError != "why "+receipt.Name || !receipt.CanReadAgain || receipt.ReceiptId == 0 {
			t.Errorf("an unread receipt carries its household, reason and flag: %+v", receipt)
		}
	}
}

// Both lists are arrays on the wire, never null.
func TestAnEmptyScanQueueIsTwoEmptyLists(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedScanQueueFixture(t)

	w, r := scanQueueRequest("GET", fixture.admin, "")
	GetScanQueue(w, r)

	if body := w.Body.String(); body != `{"scans":[],"unreadReceipts":[],"unreadReceiptCount":0}` {
		t.Errorf("unexpected empty queue: %s", body)
	}
}

func TestScanQueueSummaryCountsTheCallersHouseholdsOnly(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedScanQueueFixture(t)
	jobRepository := repositories.NewJobRepository(nil)
	now := time.Now()

	fixture.queueScan(t, fixture.group, fixture.member, "one.jpg")
	retrying := fixture.queueScan(t, fixture.group, fixture.member, "two.jpg")
	retryAt := now.Add(time.Minute)
	if err := jobRepository.Fail(retrying.ID, "later", &retryAt, now); err != nil {
		t.Fatal(err)
	}
	failed := fixture.queueScan(t, fixture.group, fixture.member, "three.jpg")
	if err := jobRepository.Fail(failed.ID, "never", nil, now); err != nil {
		t.Fatal(err)
	}
	fixture.queueScan(t, fixture.otherGroup, fixture.outsider, "theirs.jpg")

	summaryFor := func(userId uint) structs.ScanQueueSummary {
		w, r := scanQueueRequest("GET", userId, "")
		GetScanQueueSummary(w, r)
		if w.Result().StatusCode != http.StatusOK {
			t.Fatalf("status %d: %s", w.Result().StatusCode, w.Body.String())
		}
		var summary structs.ScanQueueSummary
		if err := json.Unmarshal(w.Body.Bytes(), &summary); err != nil {
			t.Fatal(err)
		}
		return summary
	}

	if summary := summaryFor(fixture.member); summary.Waiting != 2 || summary.Failed != 1 {
		t.Errorf("a member counts the household's scans: %+v", summary)
	}
	if summary := summaryFor(fixture.outsider); summary.Waiting != 1 || summary.Failed != 0 {
		t.Errorf("someone of another household counts only theirs: %+v", summary)
	}
}

func TestRerunQueuedScan(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedScanQueueFixture(t)
	jobRepository := repositories.NewJobRepository(nil)
	now := time.Now()

	waiting := fixture.queueScan(t, fixture.group, fixture.member, "waiting.jpg")
	failed := fixture.queueScan(t, fixture.group, fixture.member, "failed.jpg")
	if err := jobRepository.Fail(failed.ID, "never", nil, now); err != nil {
		t.Fatal(err)
	}
	gone := fixture.queueScan(t, fixture.group, fixture.member, "gone.jpg")
	if err := jobRepository.Fail(gone.ID, "never", nil, now); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(fixture.tempDir, "gone.jpg")); err != nil {
		t.Fatal(err)
	}

	rerun := func(userId uint, id string) *httptest.ResponseRecorder {
		w, r := scanQueueRequest("POST", userId, id)
		RerunQueuedScan(w, r)
		return w
	}

	// An id that is not queued and a scan of a household the caller is not in answer alike.
	unknown := rerun(fixture.member, "987654")
	foreign := rerun(fixture.outsider, utils.UintToString(failed.ID))
	if unknown.Result().StatusCode != http.StatusForbidden || foreign.Result().StatusCode != http.StatusForbidden ||
		unknown.Body.String() != foreign.Body.String() {
		t.Errorf("unknown: %d %s; foreign: %d %s", unknown.Result().StatusCode, unknown.Body.String(),
			foreign.Result().StatusCode, foreign.Body.String())
	}
	if w := rerun(fixture.member, "not-a-number"); w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("a malformed id answers like a refusal, got %d", w.Result().StatusCode)
	}

	if w := rerun(fixture.member, utils.UintToString(waiting.ID)); w.Result().StatusCode != http.StatusBadRequest {
		t.Errorf("a waiting scan cannot be run again, got %d", w.Result().StatusCode)
	}
	if w := rerun(fixture.member, utils.UintToString(gone.ID)); w.Result().StatusCode != http.StatusBadRequest {
		t.Errorf("a scan whose photo is gone cannot be run again, got %d", w.Result().StatusCode)
	}

	if w := rerun(fixture.member, utils.UintToString(failed.ID)); w.Result().StatusCode != http.StatusOK {
		t.Fatalf("a failed scan is run again, got %d: %s", w.Result().StatusCode, w.Body.String())
	}
	job, found, err := jobRepository.Find(failed.ID)
	if err != nil || !found || job.Status != models.JobPending || job.Attempts != 0 {
		t.Errorf("the scan waits again with a fresh set of tries: %+v, %v, %v", job, found, err)
	}
	// Pressing it twice starts it once.
	if w := rerun(fixture.member, utils.UintToString(failed.ID)); w.Result().StatusCode != http.StatusBadRequest {
		t.Errorf("a scan that waits again is not run again, got %d", w.Result().StatusCode)
	}
}

func TestQueuedScanFileAnswersARefusalForWhatTheCallerCannotReach(t *testing.T) {
	defer repositories.TruncateTestDb()
	fixture := seedScanQueueFixture(t)

	scan := fixture.queueScan(t, fixture.group, fixture.member, "photo.jpg")
	file := func(userId uint, id string) *httptest.ResponseRecorder {
		w, r := scanQueueRequest("GET", userId, id)
		GetQueuedScanFile(w, r)
		return w
	}

	if w := file(fixture.member, "987654"); w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("an id that is not queued: %d", w.Result().StatusCode)
	}
	if w := file(fixture.outsider, utils.UintToString(scan.ID)); w.Result().StatusCode != http.StatusForbidden {
		t.Errorf("another household's scan: %d", w.Result().StatusCode)
	}

	if err := os.Remove(filepath.Join(fixture.tempDir, "photo.jpg")); err != nil {
		t.Fatal(err)
	}
	if w := file(fixture.member, utils.UintToString(scan.ID)); w.Result().StatusCode != http.StatusNotFound {
		t.Errorf("a photo that is gone is a 404 for someone who may see it, got %d", w.Result().StatusCode)
	}
}
