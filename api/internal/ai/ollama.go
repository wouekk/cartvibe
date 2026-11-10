package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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

func (ollama OllamaClient) GetChatCompletion() (structs.ChatCompletionResult, error) {
	result := structs.ChatCompletionResult{}
	body := map[string]interface{}{
		"model":       ollama.ReceiptProcessingSettings.Model,
		"messages":    ollama.Options.Messages,
		"temperature": 0,
		// Ollama's own /api/chat reads sampling settings only from "options"; the top-level temperature is
		// for OpenAI-style servers on the same URL.
		"options": map[string]interface{}{"temperature": 0},
		"stream":  false,
	}

	if ollama.ReceiptProcessingSettings.EnforceJsonResponseFormat {
		body["format"] = "json"
	}
	httpClient := http.Client{}
	httpClient.Timeout = constants.AiLocalHttpTimeout

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return result, err
	}

	bodyBytesBuffer := bytes.NewBuffer(bodyBytes)

	request, err := http.NewRequest(http.MethodPost, ollama.ReceiptProcessingSettings.Url, bodyBytesBuffer)
	if err != nil {
		return result, err
	}

	request.Header.Set("Content-Type", "application/json")
	request.Close = true

	response, err := httpClient.Do(request)
	if err != nil {
		return result, err
	}

	defer response.Body.Close()

	responseBody, err := io.ReadAll(response.Body)
	if err != nil {
		return result, err
	}

	// Ollama says what went wrong in the body of a non-2xx answer ({"error":"model 'x' not found"}). Read as a chat
	// answer it would be an empty message and surface later as "the AI's answer could not be read"; the real reason
	// goes into the error and the raw response instead.
	if response.StatusCode < 200 || response.StatusCode > 299 {
		result.RawResponse = string(responseBody)
		return result, fmt.Errorf("the model server answered %d: %s", response.StatusCode, ollamaErrorMessage(responseBody))
	}

	var responseObject structs.OllamaTextResponse
	err = json.Unmarshal(responseBody, &responseObject)
	if err != nil {
		return result, err
	}

	result.Response = responseObject.Message.Content

	responseBytes, err := json.Marshal(responseObject)
	if err != nil {
		result.RawResponse = string(responseBytes)
		return result, err
	}
	result.RawResponse = string(responseBytes)

	return result, nil
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
