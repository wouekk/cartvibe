package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
)

func magicFillErrorMessage(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body %q: %v", w.Body.String(), err)
	}
	return body["errorMsg"]
}

func TestWriteMagicFillErrorTellsAFailedAiFromAServerError(t *testing.T) {
	// The AI was asked and failed (or answered something unreadable): 502 with a message the form shows.
	w := httptest.NewRecorder()
	code, err := writeMagicFillError(w, commands.ReceiptProcessingMetadata{ReceiptProcessingSettingsIdRan: 3}, errors.New("402 out of credit"))
	if code != 0 || err != nil {
		t.Fatalf("expected the response written by the helper, got %d %v", code, err)
	}
	if w.Code != http.StatusBadGateway || magicFillErrorMessage(t, w) != magicFillAiFailedMessage {
		t.Errorf("expected 502 with the AI message, got %d %q", w.Code, w.Body.String())
	}

	// Nothing to do with the AI: left to HandleRequest as a 500.
	w = httptest.NewRecorder()
	code, err = writeMagicFillError(w, commands.ReceiptProcessingMetadata{}, errors.New("disk full"))
	if code != http.StatusInternalServerError || err == nil || w.Body.Len() != 0 {
		t.Errorf("expected a 500 left to HandleRequest, got %d %v %q", code, err, w.Body.String())
	}
}

// End to end: with no AI chosen, Magic Fill on an uploaded photo answers 409 and says so, instead of a 500.
func TestMagicFillWithoutAnAiAnswersConflict(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestUser()
	if err := repositories.GetDB().Create(&models.SystemSettings{BaseModel: models.BaseModel{ID: 1}}).Error; err != nil {
		t.Fatalf("seed system settings: %v", err)
	}

	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	part, err := writer.CreateFormFile("file", "receipt.jpg")
	if err != nil {
		t.Fatalf("create form file: %v", err)
	}
	part.Write([]byte("not-a-real-image"))
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/receiptImage/magicFill", body)
	r.Header.Set("Content-Type", writer.FormDataContentType())
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, claimsForUser(1)))

	MagicFillFromImage(w, r)

	if w.Code != http.StatusConflict || magicFillErrorMessage(t, w) != magicFillNoAiMessage {
		t.Errorf("expected 409 with the no-AI message, got %d %q", w.Code, w.Body.String())
	}
}
