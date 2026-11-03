package handlers

import (
	"archive/zip"
	"bytes"
	"cartvibe/api/internal/permissions"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

func callBackupAs(userId uint, handler http.HandlerFunc, target string) *httptest.ResponseRecorder {
	w := httptest.NewRecorder()
	r := httptest.NewRequest("GET", target, nil)
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: userId}}))
	handler(w, r)
	return w
}

func TestBackupRoutesNeedTheExportPermission(t *testing.T) {
	defer repositories.TruncateTestDb()
	// A role with every other system permission still may not export the household.
	grantAppPerms(t, 1, permissions.AppSystemSettingsRead, permissions.AppSystemSettingsUpdate, permissions.AppUsersRead)

	for _, route := range []struct {
		handler http.HandlerFunc
		target  string
	}{
		{GetBackupSummary, "/api/backup/summary"},
		{ExportBackup, "/api/backup/export"},
		{ExportBackup, "/api/backup/export?includeFiles=true"},
	} {
		if code := callBackupAs(1, route.handler, route.target).Result().StatusCode; code != http.StatusForbidden {
			t.Errorf("%s: expected 403, got %d", route.target, code)
		}
	}
}

func TestBackupSummaryAnswersArrays(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppBackupExport)

	response := callBackupAs(1, GetBackupSummary, "/api/backup/summary")
	if response.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", response.Result().StatusCode, response.Body.String())
	}

	var summary structs.BackupSummary
	if err := json.Unmarshal(response.Body.Bytes(), &summary); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(summary.Counts) == 0 || summary.FormatVersion != 1 {
		t.Errorf("unexpected summary: %+v", summary)
	}
	for _, count := range summary.Counts {
		if count.Name == "users" && count.Count != 1 {
			t.Errorf("expected the one user, got %d", count.Count)
		}
	}
}

func TestExportBackupStreamsAZipWithAManifest(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppBackupExport)

	response := callBackupAs(1, ExportBackup, "/api/backup/export?includeFiles=false")
	if response.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", response.Result().StatusCode, response.Body.String())
	}
	if contentType := response.Header().Get("Content-Type"); contentType != "application/zip" {
		t.Errorf("content type %q", contentType)
	}
	if disposition := response.Header().Get("Content-Disposition"); !strings.Contains(disposition, "cartvibe-backup-") {
		t.Errorf("content disposition %q", disposition)
	}

	content := response.Body.Bytes()
	archive, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		t.Fatalf("not a zip: %v", err)
	}
	names := map[string]bool{}
	for _, file := range archive.File {
		names[file.Name] = true
	}
	if !names["manifest.json"] || !names["receipts.csv"] || !names["users.csv"] {
		t.Errorf("entries: %v", names)
	}
}

func TestExportBackupRefusesABadIncludeFiles(t *testing.T) {
	defer repositories.TruncateTestDb()
	grantAppPerms(t, 1, permissions.AppBackupExport)

	if code := callBackupAs(1, ExportBackup, "/api/backup/export?includeFiles=maybe").Result().StatusCode; code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", code)
	}
}
