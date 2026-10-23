package ai

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// anthropicRequest is what a test reads back from the fake Anthropic endpoint.
type anthropicRequest struct {
	Path    string
	Key     string
	Version string
	Body    map[string]any
}

// newFakeAnthropic answers every call with status and body, and points the client at it for the length of the test.
func newFakeAnthropic(t *testing.T, status int, body string) *[]anthropicRequest {
	t.Helper()
	requests := []anthropicRequest{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		request := anthropicRequest{Path: r.URL.Path, Key: r.Header.Get("x-api-key"), Version: r.Header.Get("anthropic-version")}
		bytes, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(bytes, &request.Body)
		requests = append(requests, request)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	previous := anthropicBaseUrl
	anthropicBaseUrl = server.URL
	t.Cleanup(func() { anthropicBaseUrl = previous })

	return &requests
}

func anthropicMessage(stopReason string, content string) string {
	return `{"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5-5",
		"stop_reason": "` + stopReason + `", "usage": {"input_tokens": 10, "output_tokens": 5},
		"content": ` + content + `}`
}

func anthropicClientFor(model string, images ...string) *AnthropicClient {
	return NewAnthropicClient(
		structs.AiChatCompletionOptions{Messages: []structs.AiClientMessage{{Role: "user", Content: "Read this receipt", Images: images}}},
		models.ReceiptProcessingSettings{AiType: models.ANTHROPIC, Model: model, Key: "test-key"},
	)
}

func TestAnthropicSendsTheReceiptAndReturnsTheText(t *testing.T) {
	requests := newFakeAnthropic(t, http.StatusOK, anthropicMessage("end_turn",
		`[{"type": "thinking", "thinking": "", "signature": "x"}, {"type": "text", "text": "{\"name\": \"Edeka\"}"}]`))
	jpeg := utils.Base64Encode([]byte("\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00"))

	result, err := anthropicClientFor("claude-sonnet-5-5", jpeg).GetChatCompletion()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Response != `{"name": "Edeka"}` {
		t.Fatalf("expected only the text block, got %q", result.Response)
	}
	if result.RawResponse == "" {
		t.Fatal("expected the raw answer to be kept for the system task")
	}

	if len(*requests) != 1 {
		t.Fatalf("expected one call (no SDK retries), got %d", len(*requests))
	}
	request := (*requests)[0]
	if request.Path != "/v1/messages" || request.Key != "test-key" || request.Version == "" {
		t.Fatalf("unexpected request: path %q key %q version %q", request.Path, request.Key, request.Version)
	}
	if request.Body["model"] != "claude-sonnet-5-5" {
		t.Fatalf("expected the configured model, got %v", request.Body["model"])
	}
	if _, sent := request.Body["temperature"]; sent {
		t.Fatal("temperature must not be sent: current Claude models refuse it")
	}

	messages := request.Body["messages"].([]any)
	content := messages[0].(map[string]any)["content"].([]any)
	image := content[0].(map[string]any)
	source := image["source"].(map[string]any)
	if image["type"] != "image" || source["media_type"] != "image/jpeg" || source["data"] != jpeg {
		t.Fatalf("expected the image first as base64 JPEG, got %v", image)
	}
	if text := content[1].(map[string]any); text["type"] != "text" || text["text"] != "Read this receipt" {
		t.Fatalf("expected the prompt after the image, got %v", text)
	}
}

func TestAnthropicFallsBackToTheDefaultModel(t *testing.T) {
	requests := newFakeAnthropic(t, http.StatusOK, anthropicMessage("end_turn", `[{"type": "text", "text": "hello"}]`))

	if _, err := anthropicClientFor("  ").GetChatCompletion(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if (*requests)[0].Body["model"] != DefaultAnthropicModel {
		t.Fatalf("expected %s, got %v", DefaultAnthropicModel, (*requests)[0].Body["model"])
	}
}

func TestAnthropicRefusalIsAnError(t *testing.T) {
	newFakeAnthropic(t, http.StatusOK, anthropicMessage("refusal", `[]`))

	if _, err := anthropicClientFor("claude-opus-5-5").GetChatCompletion(); err == nil {
		t.Fatal("a declined request must fail, so the backup AI can take the receipt")
	}
}

func TestAnthropicOutageIsAnErrorWithoutRetries(t *testing.T) {
	requests := newFakeAnthropic(t, http.StatusInternalServerError,
		`{"type": "error", "error": {"type": "api_error", "message": "down"}}`)

	if _, err := anthropicClientFor("claude-opus-5-5").GetChatCompletion(); err == nil {
		t.Fatal("expected an error")
	}
	if len(*requests) != 1 {
		t.Fatalf("expected a single try, got %d", len(*requests))
	}
}

func TestStripJsonFence(t *testing.T) {
	cases := map[string]string{
		"```json\n{\"a\": 1}\n```": `{"a": 1}`,
		"```\n[1, 2]\n```":         `[1, 2]`,
		"```{\"a\": 1}```":         `{"a": 1}`,
		`{"a": 1}`:                 `{"a": 1}`,
		"Here it is: ```json":      "Here it is: ```json",
	}
	for input, expected := range cases {
		if got := stripJsonFence(input); got != expected {
			t.Errorf("stripJsonFence(%q) = %q, expected %q", input, got, expected)
		}
	}
}

func TestListAnthropicModelsSkipsRetiredModels(t *testing.T) {
	requests := newFakeAnthropic(t, http.StatusOK, `{"data": [
		{"type": "model", "id": "claude-opus-5-5", "display_name": "Claude Opus 5.5", "lifecycle": "active", "created_at": "2026-09-01T00:00:00Z"},
		{"type": "model", "id": "claude-old", "display_name": "Claude Old", "lifecycle": "retired", "created_at": "2024-01-01T00:00:00Z"},
		{"type": "model", "id": "claude-haiku-5-5", "display_name": "", "lifecycle": "active", "created_at": "2026-08-01T00:00:00Z"}
	], "has_more": false, "first_id": "claude-opus-5-5", "last_id": "claude-haiku-5-5"}`)

	list, err := ListModels(context.Background(), models.ANTHROPIC, "test-key")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(list) != 2 || list[0] != (AiModel{Name: "claude-opus-5-5", DisplayName: "Claude Opus 5.5"}) ||
		list[1] != (AiModel{Name: "claude-haiku-5-5", DisplayName: "claude-haiku-5-5"}) {
		t.Fatalf("unexpected list: %v", list)
	}
	if (*requests)[0].Path != "/v1/models" || (*requests)[0].Key != "test-key" {
		t.Fatalf("unexpected request: %+v", (*requests)[0])
	}
}

func TestListAnthropicModelsRefusedKeyIsAClearError(t *testing.T) {
	newFakeAnthropic(t, http.StatusUnauthorized,
		`{"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}`)

	_, err := ListModels(context.Background(), models.ANTHROPIC, "wrong")
	if err == nil || !strings.Contains(err.Error(), "did not accept the key") {
		t.Fatalf("expected a refused-key error, got %v", err)
	}
}

func newFakeOpenAiModels(t *testing.T, status int, body string) *[]string {
	t.Helper()
	authorizations := []string{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authorizations = append(authorizations, r.URL.Path+" "+r.Header.Get("Authorization"))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(server.Close)

	previous := openAiModelsBaseUrl
	openAiModelsBaseUrl = server.URL
	t.Cleanup(func() { openAiModelsBaseUrl = previous })
	return &authorizations
}

func TestListOpenAiModelsKeepsChatModelsNewestFirst(t *testing.T) {
	calls := newFakeOpenAiModels(t, http.StatusOK, `{"object": "list", "data": [
		{"id": "gpt-4o", "created": 100},
		{"id": "text-embedding-3-small", "created": 400},
		{"id": "gpt-5-mini", "created": 300},
		{"id": "gpt-4o-realtime-preview", "created": 350},
		{"id": "o4-mini", "created": 200},
		{"id": "dall-e-3", "created": 500},
		{"id": "gpt-4o-mini-tts", "created": 450}
	]}`)

	list, err := ListModels(context.Background(), models.OPEN_AI_NEW, "sk-test")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	names := []string{}
	for _, model := range list {
		names = append(names, model.Name)
	}
	if strings.Join(names, ",") != "gpt-5-mini,o4-mini,gpt-4o" {
		t.Fatalf("unexpected list: %v", names)
	}
	if (*calls)[0] != "/models Bearer sk-test" {
		t.Fatalf("unexpected request: %s", (*calls)[0])
	}
}

func TestListOpenAiModelsRefusedKeyIsAClearError(t *testing.T) {
	newFakeOpenAiModels(t, http.StatusUnauthorized,
		`{"error": {"message": "Incorrect API key", "type": "invalid_request_error", "code": "invalid_api_key"}}`)

	_, err := ListModels(context.Background(), models.OPEN_AI_NEW, "wrong")
	if err == nil || !strings.Contains(err.Error(), "did not accept the key") {
		t.Fatalf("expected a refused-key error, got %v", err)
	}
}

func TestListModelsNeedsAKeyAndAListableProvider(t *testing.T) {
	if _, err := ListModels(context.Background(), models.ANTHROPIC, "  "); err == nil {
		t.Fatal("expected an error without a key")
	}
	if _, err := ListModels(context.Background(), models.OPEN_AI_CUSTOM_NEW, "key"); err == nil {
		t.Fatal("expected an error for a local server")
	}
}
