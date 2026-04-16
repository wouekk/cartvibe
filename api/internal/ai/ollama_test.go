package ai

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"testing"
)

// capturedOllamaRequest is what a test inspects after the client POSTs.
type capturedOllamaRequest struct {
	Method      string
	Path        string
	ContentType string
	Body        map[string]interface{}
}

// newMockOllamaServer stands up an httptest server that captures the request
// the client sent and returns a caller-chosen status/body. Returns the
// server, a pointer to the captured request (filled after Do), and a cleanup
// func.
func newMockOllamaServer(t *testing.T, statusCode int, responseBody string) (*httptest.Server, *capturedOllamaRequest) {
	t.Helper()
	captured := &capturedOllamaRequest{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		captured.Method = r.Method
		captured.Path = r.URL.Path
		captured.ContentType = r.Header.Get("Content-Type")

		bodyBytes, err := io.ReadAll(r.Body)
		if err == nil && len(bodyBytes) > 0 {
			_ = json.Unmarshal(bodyBytes, &captured.Body)
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		_, _ = w.Write([]byte(responseBody))
	}))

	t.Cleanup(server.Close)
	return server, captured
}

func newOllamaClient(url, model string, enforceJSON bool, messages []structs.AiClientMessage) *OllamaClient {
	return NewOllamaClient(
		structs.AiChatCompletionOptions{
			Messages:   messages,
			DecryptKey: false,
		},
		models.ReceiptProcessingSettings{
			Url:                       url,
			Model:                     model,
			EnforceJsonResponseFormat: enforceJSON,
		},
	)
}

func ollamaSuccessBody(content string) string {
	resp := structs.OllamaTextResponse{}
	resp.Model = "test-model"
	resp.Message.Role = "assistant"
	resp.Message.Content = content
	resp.Done = true
	raw, _ := json.Marshal(resp)
	return string(raw)
}

func TestOllamaGetChatCompletion_HappyPath(t *testing.T) {
	server, captured := newMockOllamaServer(t, http.StatusOK, ollamaSuccessBody("hello from ollama"))

	client := newOllamaClient(server.URL, "llama3", false, []structs.AiClientMessage{
		{Role: "user", Content: "hi"},
	})
	result, err := client.GetChatCompletion()
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	if result.Response != "hello from ollama" {
		utils.PrintTestError(t, result.Response, "hello from ollama")
	}
	if result.RawResponse == "" {
		utils.PrintTestError(t, "empty RawResponse", "non-empty")
	}

	if captured.Method != http.MethodPost {
		utils.PrintTestError(t, captured.Method, http.MethodPost)
	}
	if captured.ContentType != "application/json" {
		utils.PrintTestError(t, captured.ContentType, "application/json")
	}
	if captured.Body["model"] != "llama3" {
		utils.PrintTestError(t, captured.Body["model"], "llama3")
	}
	if _, ok := captured.Body["format"]; ok {
		utils.PrintTestError(t, "format field set unexpectedly", "format field absent when EnforceJsonResponseFormat=false")
	}
	// JSON numbers decode as float64
	if v, ok := captured.Body["temperature"]; !ok || v.(float64) != 0 {
		utils.PrintTestError(t, captured.Body["temperature"], float64(0))
	}
	if captured.Body["stream"] != false {
		utils.PrintTestError(t, captured.Body["stream"], false)
	}
}

func TestOllamaGetChatCompletion_EnforceJsonFormat(t *testing.T) {
	server, captured := newMockOllamaServer(t, http.StatusOK, ollamaSuccessBody("{}"))

	client := newOllamaClient(server.URL, "llama3", true, []structs.AiClientMessage{
		{Role: "user", Content: "hi"},
	})
	_, err := client.GetChatCompletion()
	if err != nil {
		utils.PrintTestError(t, err, nil)
	}

	if captured.Body["format"] != "json" {
		utils.PrintTestError(t, captured.Body["format"], "json")
	}
}

func TestOllamaGetChatCompletion_MalformedResponseBody(t *testing.T) {
	server, _ := newMockOllamaServer(t, http.StatusOK, "not json at all")

	client := newOllamaClient(server.URL, "llama3", false, []structs.AiClientMessage{
		{Role: "user", Content: "hi"},
	})
	_, err := client.GetChatCompletion()
	if err == nil {
		utils.PrintTestError(t, err, "expected unmarshal error")
	}
}

func TestOllamaGetChatCompletion_InvalidUrl(t *testing.T) {
	// Completely invalid URL (percent-encoding parse error) → http.NewRequest
	// itself fails before the network is touched.
	client := newOllamaClient("http://%zz-not-valid", "m", false, nil)

	_, err := client.GetChatCompletion()
	if err == nil {
		utils.PrintTestError(t, err, "expected request construction error")
	}
}

func TestOllamaGetChatCompletion_ConnectionError(t *testing.T) {
	server, _ := newMockOllamaServer(t, http.StatusOK, ollamaSuccessBody(""))
	// Close immediately so the next request fails at the transport layer.
	url := server.URL
	server.Close()

	client := newOllamaClient(url, "m", false, []structs.AiClientMessage{
		{Role: "user", Content: "hi"},
	})
	_, err := client.GetChatCompletion()
	if err == nil {
		utils.PrintTestError(t, err, "expected connection error")
	}
}
