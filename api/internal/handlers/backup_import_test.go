package handlers

import (
	"archive/zip"
	"bytes"
	"cartvibe/api/internal/backup"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
	"github.com/go-chi/chi/v5"
)

func backupRequestAs(userId uint, method string, target string, body *bytes.Buffer, contentType string, jobId string) *http.Request {
	if body == nil {
		body = &bytes.Buffer{}
	}
	r := httptest.NewRequest(method, target, body)
	if contentType != "" {
		r.Header.Set("Content-Type", contentType)
	}
	routeContext := chi.NewRouteContext()
	routeContext.URLParams.Add("jobId", jobId)
	ctx := context.WithValue(r.Context(), chi.RouteCtxKey, routeContext)
	ctx = context.WithValue(ctx, jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}})
	return r.WithContext(ctx)
}

func uploadBody(t *testing.T, content []byte) (*bytes.Buffer, string) {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "cartvibe-backup-2026-11-03.zip")
	if err != nil {
		t.Fatalf("form: %v", err)
	}
	part.Write(content)
	writer.Close()
	return body, writer.FormDataContentType()
}

func householdExport(t *testing.T) []byte {
	t.Helper()
	snapshot, err := backup.TakeSnapshot(repositories.GetDB(), backup.Options{Now: time.Now()})
	if err != nil {
		t.Fatalf("snapshot: %v", err)
	}
	var buffer bytes.Buffer
	if err := snapshot.WriteZip(&buffer); err != nil {
		t.Fatalf("zip: %v", err)
	}
	return buffer.Bytes()
}

func TestBackupImportRoutesNeedTheImportPermission(t *testing.T) {
	defer repositories.TruncateTestDb()
	// Exporting is not importing.
	grantAppPerms(t, 1, permissions.AppBackupExport, permissions.AppSystemSettingsUpdate)

	body, contentType := uploadBody(t, []byte("x"))
	routes := []struct {
		handler http.HandlerFunc
		request *http.Request
	}{
		{PreviewBackupImport, backupRequestAs(1, "POST", "/api/backup/import", body, contentType, "")},
		{GetBackupImports, backupRequestAs(1, "GET", "/api/backup/import", nil, "", "")},
		{GetBackupImport, backupRequestAs(1, "GET", "/api/backup/import/1", nil, "", "1")},
		{DeleteBackupImport, backupRequestAs(1, "DELETE", "/api/backup/import/1", nil, "", "1")},
		{StartBackupImport, backupRequestAs(1, "POST", "/api/backup/import/1/start", bytes.NewBufferString("{}"), "application/json", "1")},
	}
	for _, route := range routes {
		w := httptest.NewRecorder()
		route.handler(w, route.request)
		if w.Result().StatusCode != http.StatusForbidden {
			t.Errorf("%s %s: expected 403, got %d", route.request.Method, route.request.URL.Path, w.Result().StatusCode)
		}
	}
}

func TestPreviewBackupImportAnswersAPreviewAndKeepsTheFile(t *testing.T) {
	defer repositories.TruncateTestDb()
	defer os.RemoveAll(backup.UploadsDirectory())
	grantAppPerms(t, 1, permissions.AppBackupImport)

	body, contentType := uploadBody(t, householdExport(t))
	w := httptest.NewRecorder()
	PreviewBackupImport(w, backupRequestAs(1, "POST", "/api/backup/import", body, contentType, ""))
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", w.Result().StatusCode, w.Body.String())
	}

	var preview backup.Preview
	if err := json.Unmarshal(w.Body.Bytes(), &preview); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if preview.JobId == 0 || preview.FileName != "cartvibe-backup-2026-11-03.zip" || preview.Blockers == nil || preview.Warnings == nil {
		t.Errorf("preview: %+v", preview)
	}
	if _, err := os.Stat(backup.UploadPath(preview.JobId)); err != nil {
		t.Errorf("the upload must wait for the import: %v", err)
	}

	// Dropping the previewed import removes its file.
	jobId := utils.UintToString(preview.JobId)
	w = httptest.NewRecorder()
	DeleteBackupImport(w, backupRequestAs(1, "DELETE", "/api/backup/import/"+jobId, nil, "", jobId))
	if w.Result().StatusCode != http.StatusOK {
		t.Errorf("delete: %d %s", w.Result().StatusCode, w.Body.String())
	}
	if _, err := os.Stat(backup.UploadPath(preview.JobId)); err == nil {
		t.Errorf("the file must be gone after the delete")
	}
}

func TestPreviewBackupImportRefusesAFileThatIsNotAnExport(t *testing.T) {
	defer repositories.TruncateTestDb()
	defer os.RemoveAll(backup.UploadsDirectory())
	grantAppPerms(t, 1, permissions.AppBackupImport)

	var notAnExport bytes.Buffer
	archive := zip.NewWriter(&notAnExport)
	entry, _ := archive.Create("notes.txt")
	entry.Write([]byte("hello"))
	archive.Close()

	for _, content := range [][]byte{[]byte("plain text"), notAnExport.Bytes()} {
		body, contentType := uploadBody(t, content)
		w := httptest.NewRecorder()
		PreviewBackupImport(w, backupRequestAs(1, "POST", "/api/backup/import", body, contentType, ""))
		if w.Result().StatusCode != http.StatusBadRequest || !strings.Contains(w.Body.String(), "not a CartVibe export") {
			t.Errorf("expected 400 not an export, got %d %s", w.Result().StatusCode, w.Body.String())
		}
	}
	var jobs int64
	repositories.GetDB().Model(models.BackupImportJob{}).Count(&jobs)
	if jobs != 0 {
		t.Errorf("a refused upload must leave no job, got %d", jobs)
	}
}

func TestBackupImportByIdAnswersTheDenialForAnUnknownId(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppBackupImport)

	for _, id := range []string{"999", "abc"} {
		w := httptest.NewRecorder()
		GetBackupImport(w, backupRequestAs(1, "GET", "/api/backup/import/"+id, nil, "", id))
		if w.Result().StatusCode != http.StatusForbidden || !strings.Contains(w.Body.String(), unauthorizedEntityMessage) {
			t.Errorf("%s: expected the denial, got %d %s", id, w.Result().StatusCode, w.Body.String())
		}
	}
}

func TestStartBackupImportRefusesAHouseholdWithData(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppBackupImport)
	db := repositories.GetDB()
	group := models.Group{Name: "Household", Status: models.GROUP_ACTIVE}
	db.Create(&group)
	if err := db.Create(&models.ShoppingList{GroupId: group.ID, Name: "Already here"}).Error; err != nil {
		t.Fatalf("list: %v", err)
	}
	job := models.BackupImportJob{Status: models.BackupImportPreviewed}
	db.Create(&job)

	jobId := utils.UintToString(job.ID)
	w := httptest.NewRecorder()
	StartBackupImport(w, backupRequestAs(1, "POST", "/api/backup/import/"+jobId+"/start", bytes.NewBufferString("{}"), "application/json", jobId))
	if w.Result().StatusCode != http.StatusBadRequest || !strings.Contains(w.Body.String(), "empty household") {
		t.Errorf("expected 400, got %d %s", w.Result().StatusCode, w.Body.String())
	}
	db.First(&job, job.ID)
	if job.Status != models.BackupImportPreviewed {
		t.Errorf("the job must stay previewed: %s", job.Status)
	}
}

func TestGetBackupImportsAnswersAnArray(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppBackupImport)

	w := httptest.NewRecorder()
	GetBackupImports(w, backupRequestAs(1, "GET", "/api/backup/import", nil, "", ""))
	if w.Result().StatusCode != http.StatusOK || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Errorf("expected [], got %d %s", w.Result().StatusCode, w.Body.String())
	}
}
