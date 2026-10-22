package ai

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
	"strings"
	"testing"

	"google.golang.org/genai"
)

const geminiAnswer = `{"candidates": [{"content": {"role": "model", "parts": [
	{"text": "thinking about it", "thought": true},
	{"text": "{\"name\": \"Edeka\"}"}
]}}]}`

// geminiRequest is what a test reads back from the fake Google endpoint.
type geminiRequest struct {
	Path   string
	Key    string
	Config map[string]any
	Parts  []map[string]any
}

// newFakeGemini answers each generateContent call with the next status in statuses (200 = geminiAnswer),
// and points the client at it for the length of the test.
func newFakeGemini(t *testing.T, statuses ...int) *[]geminiRequest {
	t.Helper()
	requests := []geminiRequest{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Contents []struct {
				Parts []map[string]any `json:"parts"`
			} `json:"contents"`
			GenerationConfig map[string]any `json:"generationConfig"`
		}
		bytes, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(bytes, &body)

		request := geminiRequest{Path: r.URL.Path, Key: r.Header.Get("x-goog-api-key"), Config: body.GenerationConfig}
		if len(body.Contents) > 0 {
			request.Parts = body.Contents[0].Parts
		}
		requests = append(requests, request)

		status := http.StatusOK
		if len(requests) <= len(statuses) {
			status = statuses[len(requests)-1]
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		if status == http.StatusOK {
			_, _ = w.Write([]byte(geminiAnswer))
		} else {
			// The SDK reads the code from the body, so it has to match the status.
			_, _ = w.Write([]byte(fmt.Sprintf(`{"error": {"code": %d, "message": "refused", "status": "ERROR"}}`, status)))
		}
	}))
	t.Cleanup(server.Close)

	previous := geminiBaseUrl
	geminiBaseUrl = server.URL
	t.Cleanup(func() { geminiBaseUrl = previous })

	return &requests
}

func geminiClientFor(model string, images ...string) *GeminiClient {
	return NewGeminiClient(
		structs.AiChatCompletionOptions{Messages: []structs.AiClientMessage{{Role: "user", Content: "Read this receipt", Images: images}}},
		models.ReceiptProcessingSettings{Model: model, Key: "test-key", EnforceJsonResponseFormat: true},
	)
}

func TestGeminiReturnsTheAnswerWithoutTheThoughts(t *testing.T) {
	requests := newFakeGemini(t)

	jpeg := utils.Base64Encode([]byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 'J', 'F', 'I', 'F'})
	result, err := geminiClientFor("gemini-2.5-flash", jpeg).GetChatCompletion()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Response != `{"name": "Edeka"}` {
		t.Errorf("expected only the answer text, got %q", result.Response)
	}
	if !strings.Contains(result.RawResponse, "candidates") {
		t.Errorf("expected the raw response kept, got %q", result.RawResponse)
	}

	request := (*requests)[0]
	if !strings.HasSuffix(request.Path, "/models/gemini-2.5-flash:generateContent") {
		t.Errorf("unexpected path %s", request.Path)
	}
	if request.Key != "test-key" {
		t.Errorf("expected the key in the header, got %q", request.Key)
	}
	if request.Config["responseMimeType"] != "application/json" {
		t.Errorf("expected the JSON answer format, got %v", request.Config)
	}
	if len(request.Parts) != 2 || request.Parts[1]["inlineData"] == nil {
		t.Errorf("expected the prompt and the image, got %v", request.Parts)
	}
}

func TestGeminiTurnsThinkingDownPerModel(t *testing.T) {
	tests := map[string]string{
		"gemini-2.5-flash":             `{"thinkingBudget":0}`,
		"models/gemini-2.5-flash-lite": `{"thinkingBudget":0}`,
		"gemini-2.5-pro":               `{"thinkingBudget":128}`,
		"gemini-3-flash-preview":       `{"thinkingLevel":"LOW"}`,
		"gemma-3-27b-it":               `null`,
	}

	for model, expected := range tests {
		requests := newFakeGemini(t)
		if _, err := geminiClientFor(model).GetChatCompletion(); err != nil {
			t.Fatalf("%s: unexpected error: %v", model, err)
		}
		thinking, _ := json.Marshal((*requests)[0].Config["thinkingConfig"])
		if string(thinking) != expected {
			t.Errorf("%s: expected thinking %s, got %s", model, expected, thinking)
		}
	}
}

func TestGeminiAsksAgainWithoutThinkingWhenTheModelRefusesIt(t *testing.T) {
	requests := newFakeGemini(t, http.StatusBadRequest)

	result, err := geminiClientFor("gemini-2.5-flash").GetChatCompletion()
	if err != nil {
		t.Fatalf("expected the second call to succeed, got %v", err)
	}
	if result.Response != `{"name": "Edeka"}` || len(*requests) != 2 {
		t.Fatalf("expected two calls and the answer, got %d calls and %q", len(*requests), result.Response)
	}
	if (*requests)[1].Config["thinkingConfig"] != nil {
		t.Errorf("expected no thinking setting on the second call, got %v", (*requests)[1].Config)
	}
}

func TestGeminiDoesNotRetryAnOutage(t *testing.T) {
	requests := newFakeGemini(t, http.StatusServiceUnavailable, http.StatusServiceUnavailable)

	if _, err := geminiClientFor("gemini-2.5-flash").GetChatCompletion(); err == nil {
		t.Fatalf("expected the outage to be reported")
	}
	if len(*requests) != 1 {
		t.Errorf("an outage must not cost a second call, got %d", len(*requests))
	}
}

func TestGeminiTemperatureIsZeroExceptOnGemini3(t *testing.T) {
	for model, want := range map[string]*float32{
		"gemini-2.5-flash":        genai.Ptr[float32](0),
		"models/gemini-2.0-flash": genai.Ptr[float32](0),
		"gemini-3-pro-preview":    nil,
	} {
		got := geminiTemperature(model)
		if (got == nil) != (want == nil) || (got != nil && *got != *want) {
			t.Errorf("%s: expected %v, got %v", model, want, got)
		}
	}
}
