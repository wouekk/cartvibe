package services

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

func aiTestSignUp() commands.SignUpCommand {
	return commands.SignUpCommand{
		Username:    "ai-test-user",
		Password:    "Password",
		DisplayName: "AI Test User",
	}
}

// Shared mock-server helpers used across ai_test, receipt_processing_test,
// and receipt_image_test. Each returns an httptest.Server plus a pointer to
// a captured request for assertions, and registers cleanup.

type capturedAiRequest struct {
	Method string
	Path   string
	Body   map[string]interface{}
}

func newMockOpenAiServerForService(t *testing.T, statusCode int, body string) (*httptest.Server, *capturedAiRequest) {
	t.Helper()
	captured := &capturedAiRequest{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured.Method = r.Method
		captured.Path = r.URL.Path
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &captured.Body)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)
	return server, captured
}

func newMockOllamaServerForService(t *testing.T, statusCode int, body string) (*httptest.Server, *capturedAiRequest) {
	return newMockOpenAiServerForService(t, statusCode, body)
}

func openAiBody(content string) string {
	return `{"id":"x","object":"chat.completion","created":1,"model":"gpt-3.5-turbo","choices":[{"index":0,"message":{"role":"assistant","content":"` + content + `"},"finish_reason":"stop"}]}`
}

func ollamaBody(content string) string {
	return `{"model":"llama3","created_at":"2024-01-01T00:00:00Z","message":{"role":"assistant","content":"` + content + `"},"done":true}`
}

// seedPromptForAi creates a minimal Prompt row and returns its ID. Required
// because ReceiptProcessingSettings.PromptId has a FK constraint.
func seedPromptForAi(t *testing.T) uint {
	t.Helper()
	prompt := models.Prompt{Name: "test-prompt", Prompt: "ping"}
	if err := repositories.GetDB().Create(&prompt).Error; err != nil {
		utils.PrintTestError(t, err, nil)
	}
	return prompt.ID
}

// seedSettingsForAi inserts a ReceiptProcessingSettings row with the given
// AiType and URL (pointing at a mock server). Skips encryption: `Key` is
// stored verbatim; tests pass DecryptKey=false.
func seedSettingsForAi(t *testing.T, aiType models.AiClientType, url string) models.ReceiptProcessingSettings {
	t.Helper()
	promptId := seedPromptForAi(t)
	settings := models.ReceiptProcessingSettings{
		Name:     "test-settings-" + string(aiType),
		AiType:   aiType,
		Url:      url,
		Model:    "test-model",
		Key:      "plain-key",
		PromptId: promptId,
	}
	if err := repositories.GetDB().Create(&settings).Error; err != nil {
		utils.PrintTestError(t, err, nil)
	}
	return settings
}

// NewAiService -------------------------------------------------------------

func TestNewAiService_MissingRowReturnsError(t *testing.T) {
	defer repositories.TruncateTestDb()

	_, err := NewAiService("999999")
	if err == nil {
		utils.PrintTestError(t, err, "expected not-found error")
	}
}

func TestNewAiService_HappyPathLoadsSettings(t *testing.T) {
	defer repositories.TruncateTestDb()

	settings := seedSettingsForAi(t, models.OPEN_AI_NEW, "http://example.invalid")
	service, err := NewAiService(utils.UintToString(settings.ID))
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if service.ReceiptProcessingSettings.ID != settings.ID {
		utils.PrintTestError(t, service.ReceiptProcessingSettings.ID, settings.ID)
	}
	if service.ReceiptProcessingSettings.AiType != models.OPEN_AI_NEW {
		utils.PrintTestError(t, service.ReceiptProcessingSettings.AiType, models.OPEN_AI_NEW)
	}
}

// CreateChatCompletion -----------------------------------------------------

func TestCreateChatCompletion_OpenAi_HappyPath(t *testing.T) {
	defer repositories.TruncateTestDb()

	server, _ := newMockOpenAiServerForService(t, http.StatusOK, openAiBody("hi from openai"))

	settings := seedSettingsForAi(t, models.OPEN_AI_NEW, server.URL)
	service := &AiService{ReceiptProcessingSettings: settings}

	resp, task, err := service.CreateChatCompletion(structs.AiChatCompletionOptions{
		Messages:   []structs.AiClientMessage{{Role: "user", Content: "ping"}},
		DecryptKey: false,
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if resp != "hi from openai" {
		utils.PrintTestError(t, resp, "hi from openai")
	}
	if task.Status != models.SYSTEM_TASK_SUCCEEDED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_SUCCEEDED)
	}
	if task.ResultDescription == "" {
		utils.PrintTestError(t, "empty ResultDescription", "non-empty raw response")
	}
	if task.EndedAt == nil {
		utils.PrintTestError(t, task.EndedAt, "non-nil EndedAt")
	}
}

func TestCreateChatCompletion_OpenAiCustom_HappyPath(t *testing.T) {
	defer repositories.TruncateTestDb()

	server, _ := newMockOpenAiServerForService(t, http.StatusOK, openAiBody("custom-ok"))

	settings := seedSettingsForAi(t, models.OPEN_AI_CUSTOM_NEW, server.URL)
	service := &AiService{ReceiptProcessingSettings: settings}

	resp, task, err := service.CreateChatCompletion(structs.AiChatCompletionOptions{
		Messages:   []structs.AiClientMessage{{Role: "user", Content: "ping"}},
		DecryptKey: false,
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if resp != "custom-ok" {
		utils.PrintTestError(t, resp, "custom-ok")
	}
	if task.Status != models.SYSTEM_TASK_SUCCEEDED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_SUCCEEDED)
	}
}

func TestCreateChatCompletion_Ollama_HappyPath(t *testing.T) {
	defer repositories.TruncateTestDb()

	server, _ := newMockOllamaServerForService(t, http.StatusOK, ollamaBody("hi from ollama"))

	settings := seedSettingsForAi(t, models.OLLAMA, server.URL)
	service := &AiService{ReceiptProcessingSettings: settings}

	resp, task, err := service.CreateChatCompletion(structs.AiChatCompletionOptions{
		Messages:   []structs.AiClientMessage{{Role: "user", Content: "ping"}},
		DecryptKey: false,
	})
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if resp != "hi from ollama" {
		utils.PrintTestError(t, resp, "hi from ollama")
	}
	if task.Status != models.SYSTEM_TASK_SUCCEEDED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_SUCCEEDED)
	}
}

func TestCreateChatCompletion_InvalidAiType(t *testing.T) {
	defer repositories.TruncateTestDb()

	// AiType has a DB-level validator, so we don't persist — CreateChatCompletion
	// operates directly on the in-memory settings and doesn't query DB on the
	// default branch.
	service := &AiService{
		ReceiptProcessingSettings: models.ReceiptProcessingSettings{
			Name:   "bogus",
			AiType: "BOGUS",
			Url:    "http://example.invalid",
		},
	}
	_, task, err := service.CreateChatCompletion(structs.AiChatCompletionOptions{
		Messages:   []structs.AiClientMessage{{Role: "user", Content: "ping"}},
		DecryptKey: false,
	})
	if err == nil {
		utils.PrintTestError(t, err, "expected invalid ai type error")
	}
	// The default branch returns the systemTask at its SUCCEEDED initial
	// value, but still errors out — document observed behavior.
	_ = task
}

func TestCreateChatCompletion_DownedServer_Failed(t *testing.T) {
	defer repositories.TruncateTestDb()

	server, _ := newMockOllamaServerForService(t, http.StatusOK, ollamaBody(""))
	url := server.URL
	server.Close() // shut down so the next request fails at transport

	settings := seedSettingsForAi(t, models.OLLAMA, url)
	service := &AiService{ReceiptProcessingSettings: settings}

	_, task, err := service.CreateChatCompletion(structs.AiChatCompletionOptions{
		Messages:   []structs.AiClientMessage{{Role: "user", Content: "ping"}},
		DecryptKey: false,
	})
	if err == nil {
		utils.PrintTestError(t, err, "expected connection error")
	}
	if task.Status != models.SYSTEM_TASK_FAILED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_FAILED)
	}
	if task.EndedAt == nil {
		utils.PrintTestError(t, task.EndedAt, "non-nil EndedAt")
	}
}

// CheckConnectivity --------------------------------------------------------

func TestCheckConnectivity_HappyPath_SavesSystemTask(t *testing.T) {
	defer repositories.TruncateTestDb()

	userRepo := repositories.NewUserRepository(nil)
	user, err := userRepo.CreateUser(aiTestSignUp())
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	server, _ := newMockOllamaServerForService(t, http.StatusOK, ollamaBody("hello"))
	settings := seedSettingsForAi(t, models.OLLAMA, server.URL)
	service := &AiService{ReceiptProcessingSettings: settings}

	task, err := service.CheckConnectivity(user.ID, false)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if task.Status != models.SYSTEM_TASK_SUCCEEDED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_SUCCEEDED)
	}
	// With settings ID > 0, the task should be persisted.
	var count int64
	repositories.GetDB().Model(&models.SystemTask{}).Count(&count)
	if count == 0 {
		utils.PrintTestError(t, "no SystemTask rows", ">=1")
	}
}

func TestCheckConnectivity_NoSettingsId_DoesNotPersist(t *testing.T) {
	defer repositories.TruncateTestDb()

	userRepo := repositories.NewUserRepository(nil)
	user, err := userRepo.CreateUser(aiTestSignUp())
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	server, _ := newMockOllamaServerForService(t, http.StatusOK, ollamaBody("hello"))
	// Settings ID = 0 (not persisted) → CheckConnectivity should not save.
	service := &AiService{
		ReceiptProcessingSettings: models.ReceiptProcessingSettings{
			AiType:   models.OLLAMA,
			Url:      server.URL,
			Model:    "test-model",
			PromptId: seedPromptForAi(t),
		},
	}

	task, err := service.CheckConnectivity(user.ID, false)
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}
	if task.Status != models.SYSTEM_TASK_SUCCEEDED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_SUCCEEDED)
	}

	var count int64
	repositories.GetDB().Model(&models.SystemTask{}).Count(&count)
	if count != 0 {
		utils.PrintTestError(t, count, int64(0))
	}
}

func TestCheckConnectivity_Failure_RecordsFailedStatus(t *testing.T) {
	defer repositories.TruncateTestDb()

	userRepo := repositories.NewUserRepository(nil)
	user, err := userRepo.CreateUser(aiTestSignUp())
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	// Start a server then close it → Do() errors.
	server, _ := newMockOllamaServerForService(t, http.StatusOK, ollamaBody(""))
	url := server.URL
	server.Close()

	settings := seedSettingsForAi(t, models.OLLAMA, url)
	service := &AiService{ReceiptProcessingSettings: settings}

	task, err := service.CheckConnectivity(user.ID, false)
	if err != nil {
		// CheckConnectivity itself does not propagate the chat error; it
		// records FAILED status and returns the saved SystemTask. So no
		// error here is the expected shape.
		utils.PrintTestError(t, err, nil)
	}
	if task.Status != models.SYSTEM_TASK_FAILED {
		utils.PrintTestError(t, task.Status, models.SYSTEM_TASK_FAILED)
	}
}
