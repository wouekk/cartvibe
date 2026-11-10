package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
)

type OllamaClient struct {
	BaseClient
}

func NewOllamaClient(
	options structs.AiChatCompletionOptions,
	receiptProcessingSettings models.ReceiptProcessingSettings,
) *OllamaClient {
	return &OllamaClient{
		BaseClient{
			Options:                   options,
			ReceiptProcessingSettings: receiptProcessingSettings,
		},
	}
}

// OllamaChatUrl is where the chat request goes. A URL that names only the server ("http://nas:11434") gets
// Ollama's own chat path; a URL with a path is used as typed, as before (some people run Ollama behind a proxy
// under another path, or point this at a compatible server).
func OllamaChatUrl(configured string) string {
	parsed, err := url.Parse(strings.TrimSpace(configured))
	if err != nil || parsed.Host == "" || (parsed.Path != "" && parsed.Path != "/") {
		return configured
	}
	parsed.Path = "/api/chat"
	return parsed.String()
}

func (ollama OllamaClient) GetChatCompletion() (structs.ChatCompletionResult, error) {
	result := structs.ChatCompletionResult{}
	options := map[string]interface{}{"temperature": 0}
	// Ollama keeps only its default context (a few thousand tokens) unless told otherwise, and drops the start of
	// a longer prompt without a word: a long receipt plus the category list then reads as half a receipt.
	if ollama.ReceiptProcessingSettings.ContextSize > 0 {
		options["num_ctx"] = ollama.ReceiptProcessingSettings.ContextSize
	}
	body := map[string]interface{}{
		"model":       ollama.ReceiptProcessingSettings.Model,
		"messages":    ollama.Options.Messages,
		"temperature": 0,
		// Ollama's own /api/chat reads sampling settings only from "options"; the top-level temperature is
		// for OpenAI-style servers on the same URL.
		"options": options,
		"stream":  false,
	}

	// "json" asks for any JSON; a schema asks for JSON of that shape (Ollama 0.5 and later).
	schema := ollama.Options.ResponseSchema
	structured := schema != nil && !wantsPlainAnswer(ollama.ReceiptProcessingSettings)
	if ollama.ReceiptProcessingSettings.EnforceJsonResponseFormat {
		body["format"] = "json"
	}
	if structured {
		body["format"] = schema.Schema
	}

	status, responseBody, err := ollama.post(body)
	if err != nil {
		return result, err
	}
	// A server that does not know a schema as a format answers 400: ask once more the way it was asked before.
	if status == http.StatusBadRequest && structured {
		delete(body, "format")
		if ollama.ReceiptProcessingSettings.EnforceJsonResponseFormat {
			body["format"] = "json"
		}
		status, responseBody, err = ollama.post(body)
		if err != nil {
			return result, err
		}
		if status >= 200 && status <= 299 {
			rememberPlainAnswer(ollama.ReceiptProcessingSettings)
		}
	}

	// Ollama says what went wrong in the body of a non-2xx answer ({"error":"model 'x' not found"}). Read as a chat
	// answer it would be an empty message and surface later as "the AI's answer could not be read"; the real reason
	// goes into the error and the raw response instead.
	if status < 200 || status > 299 {
		result.RawResponse = string(responseBody)
		return result, fmt.Errorf("the model server answered %d: %s", status, ollamaErrorMessage(responseBody))
	}

	var responseObject structs.OllamaTextResponse
	err = json.Unmarshal(responseBody, &responseObject)
	if err != nil {
		return result, err
	}

	result.Response = responseObject.Message.Content
	result.InputTokens = int64(responseObject.PromptEvalCount)
	result.OutputTokens = int64(responseObject.EvalCount)

	responseBytes, err := json.Marshal(responseObject)
	if err != nil {
		result.RawResponse = string(responseBytes)
		return result, err
	}
	result.RawResponse = string(responseBytes)

	return result, nil
}

// post sends one chat request and returns the status and the body.
func (ollama OllamaClient) post(body map[string]interface{}) (int, []byte, error) {
	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return 0, nil, err
	}

	request, err := http.NewRequest(http.MethodPost, OllamaChatUrl(ollama.ReceiptProcessingSettings.Url), bytes.NewBuffer(bodyBytes))
	if err != nil {
		return 0, nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Close = true

	httpClient := http.Client{Timeout: constants.AiLocalHttpTimeout}
	response, err := httpClient.Do(request)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return 0, nil, err
	}

	return response.StatusCode, responseBody, nil
}

// ollamaErrorMessage is the "error" text of an Ollama (or OpenAI-style) error body, or the body itself, cut short,
// when it is something else (a proxy's HTML page).
func ollamaErrorMessage(body []byte) string {
	var parsed struct {
		Error json.RawMessage `json:"error"`
	}
	if json.Unmarshal(body, &parsed) == nil && len(parsed.Error) > 0 {
		var text string
		if json.Unmarshal(parsed.Error, &text) == nil && text != "" {
			return text
		}
		var nested struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(parsed.Error, &nested) == nil && nested.Message != "" {
			return nested.Message
		}
	}

	const limit = 300
	text := string(bytes.TrimSpace(body))
	if len(text) > limit {
		text = text[:limit] + "…"
	}
	if text == "" {
		return "no reason given"
	}

	return text
}
