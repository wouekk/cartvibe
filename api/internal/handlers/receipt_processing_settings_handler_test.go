package handlers

import (
	"cartvibe/api/internal/commands"
	config "cartvibe/api/internal/env"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"context"
	"encoding/json"
	"fmt"
	"github.com/go-chi/chi/v5"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	jwtmiddleware "github.com/auth0/go-jwt-middleware/v2"
	"github.com/auth0/go-jwt-middleware/v2/validator"
)

func tearDownReceiptProcessingSettings() {
	repositories.TruncateTestDb()
}

func TestShouldNotAllowUserToGetReceiptProcessingSettings(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	GetPagedReceiptProcessingSettings(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldNotGetReceiptProcessingSettingsWithBadRequest(t *testing.T) {
	defer tearDownGroupTests()

	tests := map[string]struct {
		input  commands.PagedRequestCommand
		expect int
	}{
		"badOrderBy": {
			input: commands.PagedRequestCommand{
				Page:          1,
				PageSize:      50,
				OrderBy:       "badOrderBy",
				SortDirection: "asc",
			},
			expect: http.StatusInternalServerError,
		},
		"badSortDirection": {
			input: commands.PagedRequestCommand{
				Page:          1,
				PageSize:      50,
				OrderBy:       "host",
				SortDirection: "badSortDirection",
			},
			expect: http.StatusBadRequest,
		},
		"badPage": {
			input: commands.PagedRequestCommand{
				Page:          -1,
				PageSize:      50,
				OrderBy:       "host",
				SortDirection: "asc",
			},
			expect: http.StatusBadRequest,
		},
		"badPageSize": {
			input: commands.PagedRequestCommand{
				Page:          1,
				PageSize:      -2,
				OrderBy:       "host",
				SortDirection: "asc",
			},
			expect: http.StatusBadRequest,
		},
		"good": {
			input: commands.PagedRequestCommand{
				Page:          1,
				PageSize:      50,
				OrderBy:       "name",
				SortDirection: "asc",
			},
			expect: http.StatusOK,
		},
	}

	grantAllAppPerms(t, 1)

	for name, test := range tests {
		bytes, _ := json.Marshal(test.input)
		reader := strings.NewReader(string(bytes))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api", reader)

		newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
		r = r.WithContext(newContext)

		GetPagedReceiptProcessingSettings(w, r)

		if w.Result().StatusCode != test.expect {
			utils.PrintTestError(t, w.Result().StatusCode, fmt.Sprintf("%s expected: %d", name, test.expect))
		}
	}
}

func TestShouldNotAllowUserToCreateReceiptProcessingSettings(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	CreateReceiptProcessingSettings(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldTestValidAndInvalidCreateReceiptProcessingSettingCommands(t *testing.T) {
	os.Setenv("ENCRYPTION_KEY", "test")

	tests := map[string]struct {
		input  commands.UpsertReceiptProcessingSettingsCommand
		expect int
	}{
		"empty body": {
			expect: http.StatusBadRequest,
		},
		"empty command": {
			input:  commands.UpsertReceiptProcessingSettingsCommand{},
			expect: http.StatusBadRequest,
		},
		"missing name": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Description: "description",
				AiType:      models.GEMINI,
				OcrEngine:   models.TESSERACT,
				Key:         "key",
			},
			expect: http.StatusBadRequest,
		},
		"missing ocr engine": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "name",
				Description: "description",
				AiType:      models.GEMINI,
				Key:         "key",
			},
			expect: http.StatusBadRequest,
		},
		"valid gemini settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "Gemini",
				Description: "description",
				AiType:      models.GEMINI,
				OcrEngine:   models.TESSERACT,
				Key:         "key",
			},
			expect: http.StatusOK,
		},
		// Phase 3 A3: the AI page sends no prompt; the default one is filled in.
		"valid settings without a prompt": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:      "No prompt",
				AiType:    models.GEMINI,
				OcrEngine: models.TESSERACT,
				Key:       "key",
			},
			expect: http.StatusOK,
		},
		"invalid settings without a prompt": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				AiType: models.GEMINI,
				Key:    "key",
			},
			expect: http.StatusBadRequest,
		},
		"valid openAi settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "OpenAi",
				Description: "description",
				AiType:      models.OPEN_AI,
				OcrEngine:   models.TESSERACT,
				Key:         "key",
			},
			expect: http.StatusOK,
		},
		"valid ollama settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:          "Ollama",
				Description:   "description",
				AiType:        models.OLLAMA,
				Model:         "llama3",
				IsVisionModel: true,
				OcrEngine:     models.EASY_OCR,
				Url:           "http://localhost:8080/v1/chat/completions",
			},
			expect: http.StatusOK,
		},
		"valid openAi custom settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "OpenAi Custom",
				Description: "description",
				AiType:      models.OPEN_AI_CUSTOM,
				OcrEngine:   models.EASY_OCR,
				Key:         "optionalKey",
				Url:         "http://localhost:8080/v1/chat/completions",
			},
			expect: http.StatusOK,
		},
	}

	for name, test := range tests {

		grantAllAppPerms(t, 1)

		bytes, _ := json.Marshal(test.input)
		reader := strings.NewReader(string(bytes))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api", reader)

		newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
		r = r.WithContext(newContext)

		CreateReceiptProcessingSettings(w, r)

		if w.Result().StatusCode != test.expect {
			utils.PrintTestError(t, w.Result().StatusCode, fmt.Sprintf("%s expected: %d", name, test.expect))
		}

		tearDownReceiptProcessingSettings()
	}
}

func TestShouldNotAllowUserToGetReceiptProcessingSettingsById(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	GetReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldNotReceiptProcessingSettingsByIdDueToBadId(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/", reader)

	var expectedStatusCode = http.StatusInternalServerError

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "badId")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	GetReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldGetReceiptProcessingSettingsById(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/", reader)

	var expectedStatusCode = http.StatusOK

	db := repositories.GetDB()
	db.Create(&models.ReceiptProcessingSettings{
	})

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "1")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	GetReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldNotAllowUserToUpdateReceiptProcessingSettingsById(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	UpdateReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldNotUpdateReceiptProcessingSettingsByIdDueToBadId(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/", reader)

	var expectedStatusCode = http.StatusInternalServerError

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "badId")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	UpdateReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldTestValidAndInvalidUpdateReceiptProcessingSettingCommands(t *testing.T) {
	defer tearDownReceiptProcessingSettings()

	os.Setenv("ENCRYPTION_KEY", "test")
	db := repositories.GetDB()
	db.Create(&models.ReceiptProcessingSettings{
		BaseModel: models.BaseModel{
			ID: 1,
		},
	})

	grantAllAppPerms(t, 1)

	tests := map[string]struct {
		input  commands.UpsertReceiptProcessingSettingsCommand
		expect int
	}{
		"empty body": {
			expect: http.StatusBadRequest,
		},
		"empty command": {
			input:  commands.UpsertReceiptProcessingSettingsCommand{},
			expect: http.StatusBadRequest,
		},
		"missing name": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Description: "description",
				AiType:      models.GEMINI,
				OcrEngine:   models.TESSERACT,
				Key:         "key",
			},
			expect: http.StatusBadRequest,
		},
		"missing ocr engine": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "name",
				Description: "description",
				AiType:      models.GEMINI,
				Key:         "key",
			},
			expect: http.StatusBadRequest,
		},
		"valid ollama vision": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:          "name",
				Description:   "description",
				AiType:        models.OLLAMA,
				Model:         "llava",
				Url:           "http://localhost:8080/v1/chat/completions",
				IsVisionModel: true,
			},
			expect: http.StatusOK,
		},
		"valid ollama": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "name",
				Description: "description",
				AiType:      models.OLLAMA,
				OcrEngine:   models.EASY_OCR,
				Model:       "llama3",
				Url:         "http://localhost:8080/v1/chat/completions",
			},
			expect: http.StatusOK,
		},
		"valid gemini settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "Gemini",
				Description: "description",
				AiType:      models.GEMINI,
				OcrEngine:   models.TESSERACT,
				Key:         "key",
			},
			expect: http.StatusOK,
		},
		"valid openAi settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "OpenAi",
				Description: "description",
				AiType:      models.OPEN_AI,
				OcrEngine:   models.TESSERACT,
				Key:         "key",
			},
			expect: http.StatusOK,
		},
		"valid openAi vision": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:          "OpenAi",
				Description:   "description",
				AiType:        models.OPEN_AI,
				Model:         "gpt-4o",
				IsVisionModel: true,
				Key:           "key",
			},
			expect: http.StatusOK,
		},
		"valid openAi custom settings": {
			input: commands.UpsertReceiptProcessingSettingsCommand{
				Name:        "OpenAi Custom",
				Description: "description",
				AiType:      models.OPEN_AI_CUSTOM,
				OcrEngine:   models.EASY_OCR,
				Key:         "optionalKey",
				Url:         "http://localhost:8080/v1/chat/completions",
			},
			expect: http.StatusOK,
		},
	}

	for name, test := range tests {
		bytes, _ := json.Marshal(test.input)
		reader := strings.NewReader(string(bytes))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api", reader)

		chiContext := chi.NewRouteContext()
		chiContext.URLParams.Add("id", "1")
		routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
		r = r.WithContext(routeContext)

		newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
		r = r.WithContext(newContext)

		UpdateReceiptProcessingSettingsById(w, r)

		if w.Result().StatusCode != test.expect {
			utils.PrintTestError(t, w.Result().StatusCode, fmt.Sprintf("%s expected: %d", name, test.expect))
		}
	}
}

func TestShouldNotAllowUserToDeleteReceiptProcessingSettingsById(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	DeleteReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldNotDeleteReceiptProcessingSettingsByIdDueToBadId(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/", reader)

	var expectedStatusCode = http.StatusInternalServerError

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "badId")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	DeleteReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldDeleteReceiptProcessingSettingsById(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	w := httptest.NewRecorder()
	reader := strings.NewReader("")
	r := httptest.NewRequest("POST", "/api/", reader)

	var expectedStatusCode = http.StatusOK

	db := repositories.GetDB()
	db.Create(&models.ReceiptProcessingSettings{
	})

	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "1")
	routeContext := context.WithValue(r.Context(), chi.RouteCtxKey, chiContext)
	r = r.WithContext(routeContext)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	grantAllAppPerms(t, 1)

	DeleteReceiptProcessingSettingsById(w, r)

	if w.Result().StatusCode != expectedStatusCode {
		utils.PrintTestError(t, w.Result().StatusCode, expectedStatusCode)
	}
}

func TestShouldNotAllowUserToCheckReceiptProcessingSettingsConnectivity(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	reader := strings.NewReader("")
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api", reader)

	newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
	r = r.WithContext(newContext)

	CheckReceiptProcessingSettingsConnectivity(w, r)

	if w.Result().StatusCode != http.StatusForbidden {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusForbidden)
	}
}

func TestShouldNotCheckReceiptProcessingSettingsConnectivityWithBadRequest(t *testing.T) {
	defer tearDownReceiptProcessingSettings()

	os.Setenv("ENCRYPTION_KEY", "test")

	key, _ := utils.EncryptAndEncodeToBase64(config.GetEncryptionKey(), "key")

	repositories.CreateTestUser()

	ocrEngine := models.TESSERACT

	db := repositories.GetDB()
	db.Create(&models.ReceiptProcessingSettings{
		Name:        "Gemini",
		Description: "description",
		AiType:      models.GEMINI,
		OcrEngine:   &ocrEngine,
		Key:         key,
	})

	grantAllAppPerms(t, 1)

	tests := map[string]struct {
		input  commands.CheckReceiptProcessingSettingsCommand
		expect int
	}{
		"empty body": {
			expect: http.StatusBadRequest,
		},
		"empty command": {
			input:  commands.CheckReceiptProcessingSettingsCommand{},
			expect: http.StatusBadRequest,
		},
		"empty id": {
			input: commands.CheckReceiptProcessingSettingsCommand{
				ID: 0,
			},
			expect: http.StatusBadRequest,
		},
		"empty command and id": {
			input: commands.CheckReceiptProcessingSettingsCommand{
				ID:                                     0,
				UpsertReceiptProcessingSettingsCommand: commands.UpsertReceiptProcessingSettingsCommand{},
			},
			expect: http.StatusBadRequest,
		},
		"badId": {
			input: commands.CheckReceiptProcessingSettingsCommand{
				ID: 200,
			},
			expect: http.StatusInternalServerError,
		},
		"goodId": {
			input: commands.CheckReceiptProcessingSettingsCommand{
				ID:                                     1,
				UpsertReceiptProcessingSettingsCommand: commands.UpsertReceiptProcessingSettingsCommand{},
			},
			expect: http.StatusOK,
		},
		"good command": {
			input: commands.CheckReceiptProcessingSettingsCommand{
				ID: 0,
				UpsertReceiptProcessingSettingsCommand: commands.UpsertReceiptProcessingSettingsCommand{
					Name:        "Gemini",
					Description: "description",
					AiType:      models.GEMINI,
					OcrEngine:   models.TESSERACT,
					Key:         "key",
				},
			},
			expect: http.StatusOK,
		},
	}

	for name, test := range tests {
		bytes, _ := json.Marshal(test.input)
		reader := strings.NewReader(string(bytes))
		w := httptest.NewRecorder()
		r := httptest.NewRequest("POST", "/api", reader)

		newContext := context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}})
		r = r.WithContext(newContext)

		CheckReceiptProcessingSettingsConnectivity(w, r)

		if w.Result().StatusCode != test.expect {
			utils.PrintTestError(t, w.Result().StatusCode, fmt.Sprintf("%s expected: %d", name, test.expect))
		}
	}
}

// A stored key is only ever sent to its own provider: asking for another provider's models without typing a key is
// refused before any call leaves the server.
func TestGetAiModelsDoesNotSendAStoredKeyToAnotherProvider(t *testing.T) {
	defer tearDownReceiptProcessingSettings()

	db := repositories.GetDB()
	db.Create(&models.ReceiptProcessingSettings{Name: "Household AI", AiType: models.GEMINI_NEW, Key: "stored"})
	grantAllAppPerms(t, 1)

	body, _ := json.Marshal(commands.AiModelsCommand{AiType: models.ANTHROPIC, ReceiptProcessingSettingsId: 1})
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/", strings.NewReader(string(body)))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}}))

	GetAiModels(w, r)

	if w.Result().StatusCode != http.StatusBadRequest {
		utils.PrintTestError(t, w.Result().StatusCode, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "Paste the API key first.") {
		t.Fatalf("expected the key error, got %s", w.Body.String())
	}
}

func TestGetAiModelsRefusesALocalServer(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	grantAllAppPerms(t, 1)

	body, _ := json.Marshal(commands.AiModelsCommand{AiType: models.OPEN_AI_CUSTOM_NEW, Key: "abc"})
	w := httptest.NewRecorder()
	r := httptest.NewRequest("POST", "/api/", strings.NewReader(string(body)))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}}))

	GetAiModels(w, r)

	if w.Result().StatusCode != http.StatusBadRequest || !strings.Contains(w.Body.String(), "aiType") {
		t.Fatalf("expected a 400 on aiType, got %d %s", w.Result().StatusCode, w.Body.String())
	}
}

func updateSettingsRequest(t *testing.T, command commands.UpsertReceiptProcessingSettingsCommand) *httptest.ResponseRecorder {
	t.Helper()
	body, _ := json.Marshal(command)
	w := httptest.NewRecorder()
	r := httptest.NewRequest("PUT", "/api/", strings.NewReader(string(body)))
	chiContext := chi.NewRouteContext()
	chiContext.URLParams.Add("id", "1")
	r = r.WithContext(context.WithValue(r.Context(), chi.RouteCtxKey, chiContext))
	r = r.WithContext(context.WithValue(r.Context(), jwtmiddleware.ContextKey{}, &validator.ValidatedClaims{CustomClaims: &structs.Claims{UserId: 1}}))

	UpdateReceiptProcessingSettingsById(w, r)
	return w
}

func seedGeminiSettingsWithKey(t *testing.T) {
	t.Helper()
	key, err := utils.EncryptAndEncodeToBase64(config.GetEncryptionKey(), "gemini-secret")
	if err != nil {
		t.Fatal(err)
	}
	repositories.GetDB().Create(&models.ReceiptProcessingSettings{Name: "Household AI", AiType: models.GEMINI_NEW, Key: key, IsVisionModel: true})
	grantAllAppPerms(t, 1)
}

// Switching a saved Gemini setting to Claude without typing a key must not keep the Gemini key for Claude.
func TestUpdateReceiptProcessingSettingsSwitchingToClaudeNeedsANewKey(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	seedGeminiSettingsWithKey(t)

	w := updateSettingsRequest(t, commands.UpsertReceiptProcessingSettingsCommand{
		Name: "Household AI", AiType: models.ANTHROPIC, Model: "claude-opus-5-5", IsVisionModel: true,
	})

	if w.Result().StatusCode != http.StatusBadRequest || !strings.Contains(w.Body.String(), "key") {
		t.Fatalf("expected a 400 asking for a key, got %d %s", w.Result().StatusCode, w.Body.String())
	}
}

func TestUpdateReceiptProcessingSettingsSwitchingToALocalServerDropsTheStoredKey(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	seedGeminiSettingsWithKey(t)

	w := updateSettingsRequest(t, commands.UpsertReceiptProcessingSettingsCommand{
		Name: "Household AI", AiType: models.OPEN_AI_CUSTOM_NEW, Url: "http://pc:1234/v1", Model: "qwen", IsVisionModel: true,
	})
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", w.Result().StatusCode, w.Body.String())
	}

	stored, err := repositories.NewReceiptProcessingSettings(nil).GetReceiptProcessingSettingsById("1")
	if err != nil {
		t.Fatal(err)
	}
	if stored.Key != "" {
		t.Fatalf("the Gemini key must not stay on a local server's settings, got %q", stored.Key)
	}
}

func TestUpdateReceiptProcessingSettingsSameProviderKeepsTheStoredKey(t *testing.T) {
	defer tearDownReceiptProcessingSettings()
	seedGeminiSettingsWithKey(t)

	w := updateSettingsRequest(t, commands.UpsertReceiptProcessingSettingsCommand{
		Name: "Household AI", AiType: models.GEMINI_NEW, Model: "gemini-3-pro", IsVisionModel: true,
	})
	if w.Result().StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d %s", w.Result().StatusCode, w.Body.String())
	}

	stored, _ := repositories.NewReceiptProcessingSettings(nil).GetReceiptProcessingSettingsById("1")
	key, _ := utils.DecryptB64EncodedData(config.GetEncryptionKey(), stored.Key)
	if key != "gemini-secret" {
		t.Fatalf("expected the stored key to stay, got %q", key)
	}
}
