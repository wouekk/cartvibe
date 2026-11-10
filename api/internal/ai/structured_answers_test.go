package ai

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
)

// What every provider gets when the caller has a schema, and what happens when a model refuses it: one more call
// without the structured settings, remembered for the process, so only the first call pays for the refusal.

var receiptSchema = &structs.AiResponseSchema{
	Name: "receipt",
	Schema: map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties":           map[string]any{"name": map[string]any{"type": "string"}},
		"required":             []string{"name"},
	},
}

// newSequenceServer answers each call with the next (status, body) pair, repeating the last one, and records the
// request bodies.
func newSequenceServer(t *testing.T, answers ...[2]any) (*httptest.Server, *[]map[string]any) {
	t.Helper()
	forgetPlainAnswers()
	t.Cleanup(forgetPlainAnswers)
	bodies := []map[string]any{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		bytes, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(bytes, &body)
		bodies = append(bodies, body)

		answer := answers[min(len(bodies), len(answers))-1]
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(answer[0].(int))
		_, _ = w.Write([]byte(answer[1].(string)))
	}))
	t.Cleanup(server.Close)

	return server, &bodies
}

const refused = `{"type": "error", "error": {"type": "invalid_request_error", "message": "unknown field", "code": "bad"}}`

func TestClaudeAsksForLowEffortAndTheSchemaAndCountsTokens(t *testing.T) {
	server, bodies := newSequenceServer(t, [2]any{200, anthropicMessage("end_turn", `[{"type": "text", "text": "{\"name\":\"Edeka\"}"}]`)})
	previous := anthropicBaseUrl
	anthropicBaseUrl = server.URL
	t.Cleanup(func() { anthropicBaseUrl = previous })

	client := anthropicClientFor("claude-opus-5-5")
	client.Options.ResponseSchema = receiptSchema
	result, err := client.GetChatCompletion()
	if err != nil {
		t.Fatal(err)
	}

	config, _ := (*bodies)[0]["output_config"].(map[string]any)
	if config["effort"] != "low" {
		t.Errorf("a receipt is read at low effort, got %v", config)
	}
	format, _ := config["format"].(map[string]any)
	if format["type"] != "json_schema" || format["schema"] == nil {
		t.Errorf("the schema goes out as the output format, got %v", format)
	}
	if result.InputTokens != 10 || result.OutputTokens != 5 {
		t.Errorf("the provider's token counts are kept, got %d in and %d out", result.InputTokens, result.OutputTokens)
	}
}

func TestClaudeAsksAgainWithoutTheSettingsAModelRefusesAndRemembersIt(t *testing.T) {
	server, bodies := newSequenceServer(t,
		[2]any{400, refused},
		[2]any{200, anthropicMessage("end_turn", `[{"type": "text", "text": "{\"name\":\"Edeka\"}"}]`)},
	)
	previous := anthropicBaseUrl
	anthropicBaseUrl = server.URL
	t.Cleanup(func() { anthropicBaseUrl = previous })

	client := anthropicClientFor("claude-older")
	client.Options.ResponseSchema = receiptSchema
	result, err := client.GetChatCompletion()
	if err != nil || result.Response != `{"name":"Edeka"}` {
		t.Fatalf("the second, plain call answers: %q, %v", result.Response, err)
	}
	if len(*bodies) != 2 || (*bodies)[1]["output_config"] != nil {
		t.Fatalf("one more call, without output_config: %v", *bodies)
	}

	// The next read of the same model goes out plain at once.
	if _, err := client.GetChatCompletion(); err != nil {
		t.Fatal(err)
	}
	if len(*bodies) != 3 || (*bodies)[2]["output_config"] != nil {
		t.Errorf("the refusal is remembered, so the third call is plain and alone: %d calls", len(*bodies))
	}
}

func TestClaudeDoesNotRememberARefusalThatWasAboutSomethingElse(t *testing.T) {
	server, bodies := newSequenceServer(t, [2]any{400, refused})
	previous := anthropicBaseUrl
	anthropicBaseUrl = server.URL
	t.Cleanup(func() { anthropicBaseUrl = previous })

	client := anthropicClientFor("claude-opus-5-5")
	if _, err := client.GetChatCompletion(); err == nil {
		t.Fatal("a request refused both ways is an error")
	}
	if len(*bodies) != 2 || wantsPlainAnswer(client.ReceiptProcessingSettings) {
		t.Errorf("two calls, and nothing remembered: %d calls", len(*bodies))
	}
}

func openAiClientWithSchema(url string) *OpenAiClient {
	client := newOpenAiClient(url, "gpt-5-mini", "key", true, []structs.AiClientMessage{{Role: "user", Content: "Read this receipt"}})
	client.ReceiptProcessingSettings.AiType = models.OPEN_AI_CUSTOM_NEW
	client.Options.ResponseSchema = receiptSchema
	return client
}

func TestOpenAiAsksForTheSchemaAndFallsBackToPlainJson(t *testing.T) {
	answer := `{"id":"1","object":"chat.completion","choices":[{"index":0,"message":{"role":"assistant","content":"{\"name\":\"Edeka\"}"},"finish_reason":"stop"}],"usage":{"prompt_tokens":120,"completion_tokens":30,"total_tokens":150}}`
	server, bodies := newSequenceServer(t, [2]any{400, `{"error": {"message": "response_format json_schema is not supported", "type": "invalid_request_error"}}`}, [2]any{200, answer})

	client := openAiClientWithSchema(server.URL)
	result, err := client.GetChatCompletion()
	if err != nil || result.Response != `{"name":"Edeka"}` {
		t.Fatalf("the plain call answers: %q, %v", result.Response, err)
	}

	first, _ := (*bodies)[0]["response_format"].(map[string]any)
	second, _ := (*bodies)[1]["response_format"].(map[string]any)
	if first["type"] != "json_schema" || second["type"] != "json_object" {
		t.Errorf("first the schema, then plain JSON: %v then %v", first, second)
	}
	schema, _ := first["json_schema"].(map[string]any)
	if schema["name"] != "receipt" || schema["strict"] != false {
		t.Errorf("the schema is named and not strict (answers leave out what could not be read): %v", schema)
	}
	if result.InputTokens != 120 || result.OutputTokens != 30 {
		t.Errorf("token counts: %d in, %d out", result.InputTokens, result.OutputTokens)
	}
	if !wantsPlainAnswer(client.ReceiptProcessingSettings) {
		t.Error("the refusal is remembered")
	}
}

// LM Studio refuses the plain json_object format (so the app saves such servers with JSON answers switched off)
// and takes a schema: the schema is tried anyway, and a refusal falls back to no format at all.
func TestOpenAiTriesTheSchemaOnAServerWithJsonAnswersSwitchedOff(t *testing.T) {
	server, bodies := newSequenceServer(t, [2]any{400, `{"error": {"message": "unsupported", "type": "invalid_request_error"}}`}, [2]any{200, openAiSuccessBody("hello")})

	client := openAiClientWithSchema(server.URL)
	client.ReceiptProcessingSettings.EnforceJsonResponseFormat = false
	if _, err := client.GetChatCompletion(); err != nil {
		t.Fatal(err)
	}
	first, _ := (*bodies)[0]["response_format"].(map[string]any)
	if first["type"] != "json_schema" {
		t.Errorf("the schema is tried first: %v", first)
	}
	if (*bodies)[1]["response_format"] != nil {
		t.Errorf("after the refusal the server gets no response format, as before: %v", (*bodies)[1]["response_format"])
	}
}

const ollamaAnswer = `{"model":"llama","message":{"role":"assistant","content":"{\"name\":\"Edeka\"}"},"done":true,"prompt_eval_count":900,"eval_count":40}`

func ollamaClientWithSchema(url string, contextSize int) *OllamaClient {
	client := newOllamaClient(url, "llama", true, []structs.AiClientMessage{{Role: "user", Content: "Read this receipt"}})
	client.ReceiptProcessingSettings.AiType = models.OLLAMA
	client.ReceiptProcessingSettings.ContextSize = contextSize
	client.Options.ResponseSchema = receiptSchema
	return client
}

func TestOllamaGetsTheSchemaTheContextSizeAndItsOwnChatPath(t *testing.T) {
	var path string
	forgetPlainAnswers()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(ollamaAnswer))
	}))
	t.Cleanup(server.Close)

	// The server alone, as a person types it.
	result, err := ollamaClientWithSchema(server.URL, 16384).GetChatCompletion()
	if err != nil {
		t.Fatal(err)
	}
	if path != "/api/chat" {
		t.Errorf("a URL that names only the server gets Ollama's chat path, got %q", path)
	}
	if result.InputTokens != 900 || result.OutputTokens != 40 {
		t.Errorf("token counts: %d in, %d out", result.InputTokens, result.OutputTokens)
	}

	for typed, want := range map[string]string{
		"http://nas:11434":             "http://nas:11434/api/chat",
		"http://nas:11434/":            "http://nas:11434/api/chat",
		"http://nas:11434/api/chat":    "http://nas:11434/api/chat",
		"https://ai.example/v1/ollama": "https://ai.example/v1/ollama",
		"not a url":                    "not a url",
	} {
		if got := OllamaChatUrl(typed); got != want {
			t.Errorf("OllamaChatUrl(%q) = %q, want %q", typed, got, want)
		}
	}
}

func TestOllamaSendsTheSchemaAndTheContextSizeAndFallsBackToJson(t *testing.T) {
	server, bodies := newSequenceServer(t, [2]any{400, `{"error":"invalid format"}`}, [2]any{200, ollamaAnswer})

	client := ollamaClientWithSchema(server.URL+"/api/chat", 16384)
	result, err := client.GetChatCompletion()
	if err != nil || result.Response != `{"name":"Edeka"}` {
		t.Fatalf("the plain call answers: %q, %v", result.Response, err)
	}

	if _, isSchema := (*bodies)[0]["format"].(map[string]any); !isSchema {
		t.Errorf("first the schema as the format, got %v", (*bodies)[0]["format"])
	}
	if (*bodies)[1]["format"] != "json" {
		t.Errorf("then plain JSON, got %v", (*bodies)[1]["format"])
	}
	options, _ := (*bodies)[0]["options"].(map[string]any)
	if options["num_ctx"] != float64(16384) {
		t.Errorf("the context size goes out as num_ctx, got %v", options)
	}
	if !wantsPlainAnswer(client.ReceiptProcessingSettings) {
		t.Error("the refusal is remembered")
	}
}

func TestOllamaLeavesTheContextSizeToTheServerWhenNoneIsSet(t *testing.T) {
	server, bodies := newSequenceServer(t, [2]any{200, ollamaAnswer})

	if _, err := ollamaClientWithSchema(server.URL+"/api/chat", 0).GetChatCompletion(); err != nil {
		t.Fatal(err)
	}
	options, _ := (*bodies)[0]["options"].(map[string]any)
	if _, sent := options["num_ctx"]; sent {
		t.Errorf("no num_ctx without a context size: %v", options)
	}
}

func TestGeminiSendsTheSchemaAndDropsItWithTheThinkingSettingOnARefusal(t *testing.T) {
	forgetPlainAnswers()
	t.Cleanup(forgetPlainAnswers)
	requests := newFakeGemini(t, http.StatusBadRequest, http.StatusOK)

	client := geminiClientFor("gemini-2.5-flash")
	client.Options.ResponseSchema = receiptSchema
	if _, err := client.GetChatCompletion(); err != nil {
		t.Fatal(err)
	}

	if (*requests)[0].Config["responseJsonSchema"] == nil {
		t.Errorf("the schema goes out with the first call: %v", (*requests)[0].Config)
	}
	if (*requests)[1].Config["responseJsonSchema"] != nil || (*requests)[1].Config["thinkingConfig"] != nil {
		t.Errorf("the second call carries neither: %v", (*requests)[1].Config)
	}
	if !wantsPlainAnswer(client.ReceiptProcessingSettings) {
		t.Error("the refusal is remembered")
	}
}
