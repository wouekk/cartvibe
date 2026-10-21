package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"receipt-wrangler/api/internal/utils"
	"strings"

	"google.golang.org/genai"
)

// geminiHttpClient is shared by every call, so connections to Google are reused instead of a new TLS
// handshake per receipt.
var geminiHttpClient = &http.Client{Timeout: constants.AiHttpTimeout}

// geminiBaseUrl overrides Google's endpoint; tests point it at a local server. Empty means Google.
var geminiBaseUrl = ""

type GeminiClient struct {
	BaseClient
}

func NewGeminiClient(
	options structs.AiChatCompletionOptions,
	receiptProcessingSettings models.ReceiptProcessingSettings,
) *GeminiClient {
	return &GeminiClient{
		BaseClient{
			Options:                   options,
			ReceiptProcessingSettings: receiptProcessingSettings,
		},
	}
}

func (gemini GeminiClient) GetChatCompletion() (structs.ChatCompletionResult, error) {
	result := structs.ChatCompletionResult{}

	ctx := context.Background()
	key, err := gemini.getKey(gemini.Options.DecryptKey)
	if err != nil {
		return result, err
	}

	client, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:     key,
		Backend:    genai.BackendGeminiAPI,
		HTTPClient: geminiHttpClient,
		// One attempt per call: the sweeps and quick scan already retry and count every try (at most three),
		// and the SDK's own retries would multiply the calls behind their back.
		HTTPOptions: genai.HTTPOptions{BaseURL: geminiBaseUrl, RetryOptions: &genai.HTTPRetryOptions{Attempts: genai.Ptr[int32](1)}},
	})
	if err != nil {
		return result, err
	}

	parts := make([]*genai.Part, 0)
	for _, aiMessage := range gemini.Options.Messages {
		parts = append(parts, genai.NewPartFromText(aiMessage.Content))

		for _, image := range aiMessage.Images {
			imageBytes, err := utils.Base64Decode(image)
			if err != nil {
				return result, err
			}
			parts = append(parts, genai.NewPartFromBytes(imageBytes, utils.GetMimeType(imageBytes).String()))
		}
	}
	contents := []*genai.Content{genai.NewContentFromParts(parts, genai.RoleUser)}

	config := &genai.GenerateContentConfig{ThinkingConfig: geminiThinkingConfig(gemini.ReceiptProcessingSettings.Model)}
	if gemini.ReceiptProcessingSettings.EnforceJsonResponseFormat {
		config.ResponseMIMEType = "application/json"
	}

	resp, err := client.Models.GenerateContent(ctx, gemini.ReceiptProcessingSettings.Model, contents, config)
	// A model that refuses the thinking setting answers 400: ask once more without it rather than fail the read.
	var apiErr genai.APIError
	if err != nil && config.ThinkingConfig != nil && errors.As(err, &apiErr) && apiErr.Code == http.StatusBadRequest {
		config.ThinkingConfig = nil
		resp, err = client.Models.GenerateContent(ctx, gemini.ReceiptProcessingSettings.Model, contents, config)
	}
	if err != nil {
		responseBytes, _ := json.Marshal(resp)
		result.RawResponse = string(responseBytes)
		return result, err
	}

	responseBytes, err := json.Marshal(resp)
	if err != nil {
		return result, err
	}
	result.RawResponse = string(responseBytes)
	result.Response = resp.Text()

	return result, nil
}

// geminiThinkingConfig keeps reading a receipt from waiting on the model's reasoning, which Gemini 2.5 and 3
// do by default and which this structured extraction does not need. 2.5 Flash turns it off (budget 0), 2.5 Pro
// cannot and gets its smallest budget, Gemini 3 its lowest level. Other models are left as they are.
func geminiThinkingConfig(model string) *genai.ThinkingConfig {
	name := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(model), "models/"))

	switch {
	case strings.HasPrefix(name, "gemini-2.5-pro"):
		return &genai.ThinkingConfig{ThinkingBudget: genai.Ptr[int32](128)}
	case strings.HasPrefix(name, "gemini-2.5-flash"):
		return &genai.ThinkingConfig{ThinkingBudget: genai.Ptr[int32](0)}
	case strings.HasPrefix(name, "gemini-3"):
		return &genai.ThinkingConfig{ThinkingLevel: genai.ThinkingLevelLow}
	}
	return nil
}
