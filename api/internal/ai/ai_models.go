package ai

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"

	"cartvibe/api/internal/models"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/sashabaranov/go-openai"
)

// AiModel is one model a key can use, as the AI page's model dropdown lists it.
type AiModel struct {
	// Name is what the settings store and the provider takes ("gemini-2.5-flash", "claude-opus-5-5", "gpt-5-mini").
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

// openAiModelsBaseUrl overrides OpenAI's endpoint for the model list; tests point it at a local server.
var openAiModelsBaseUrl = ""

// ListModels asks the provider which models the key can use. Only the cloud providers with a model list are
// supported (Claude, Gemini, ChatGPT); a refused key is an error worded for the person who typed it.
func ListModels(ctx context.Context, aiType models.AiClientType, apiKey string) ([]AiModel, error) {
	apiKey = strings.TrimSpace(apiKey)
	if apiKey == "" {
		return nil, fmt.Errorf("an API key is required to list the models")
	}

	switch aiType {
	case models.GEMINI_NEW:
		return ListGeminiModels(ctx, nil, GeminiModelsBaseUrl, apiKey)
	case models.ANTHROPIC:
		return ListAnthropicModels(ctx, apiKey)
	case models.OPEN_AI_NEW:
		return ListOpenAiModels(ctx, apiKey)
	}
	return nil, fmt.Errorf("models cannot be listed for %s", aiType)
}

// ListAnthropicModels lists the Claude models the key can call, newest first (the order Anthropic returns),
// leaving out retired ones.
func ListAnthropicModels(ctx context.Context, apiKey string) ([]AiModel, error) {
	client := newAnthropicSdkClient(apiKey)
	pager := client.Models.ListAutoPaging(ctx, anthropic.ModelListParams{Limit: anthropic.Int(100)})

	result := []AiModel{}
	for pager.Next() {
		model := pager.Current()
		if model.Lifecycle == "retired" {
			continue
		}
		displayName := strings.TrimSpace(model.DisplayName)
		if displayName == "" {
			displayName = model.ID
		}
		result = append(result, AiModel{Name: model.ID, DisplayName: displayName})
		if len(result) >= 200 {
			break
		}
	}
	if err := pager.Err(); err != nil {
		var apiErr *anthropic.Error
		if errors.As(err, &apiErr) && isRefusedKeyStatus(apiErr.StatusCode) {
			return nil, fmt.Errorf("Anthropic did not accept the key (status %d)", apiErr.StatusCode)
		}
		if errors.As(err, &apiErr) {
			return nil, fmt.Errorf("Anthropic answered with status %d", apiErr.StatusCode)
		}
		return nil, fmt.Errorf("could not reach Anthropic: %w", err)
	}

	return result, nil
}

// ListOpenAiModels lists the chat models the key can call, newest first. OpenAI's list also holds embedding,
// speech, image and moderation models, which cannot read a receipt and are left out.
func ListOpenAiModels(ctx context.Context, apiKey string) ([]AiModel, error) {
	config := openai.DefaultConfig(apiKey)
	if openAiModelsBaseUrl != "" {
		config.BaseURL = openAiModelsBaseUrl
	}
	list, err := openai.NewClientWithConfig(config).ListModels(ctx)
	if err != nil {
		var apiErr *openai.APIError
		if errors.As(err, &apiErr) && isRefusedKeyStatus(apiErr.HTTPStatusCode) {
			return nil, fmt.Errorf("OpenAI did not accept the key (status %d)", apiErr.HTTPStatusCode)
		}
		var requestErr *openai.RequestError
		if errors.As(err, &requestErr) && isRefusedKeyStatus(requestErr.HTTPStatusCode) {
			return nil, fmt.Errorf("OpenAI did not accept the key (status %d)", requestErr.HTTPStatusCode)
		}
		return nil, fmt.Errorf("could not list OpenAI's models: %w", err)
	}

	chatModels := make([]openai.Model, 0, len(list.Models))
	for _, model := range list.Models {
		if isOpenAiChatModel(model.ID) {
			chatModels = append(chatModels, model)
		}
	}
	sort.SliceStable(chatModels, func(i, j int) bool {
		if chatModels[i].CreatedAt != chatModels[j].CreatedAt {
			return chatModels[i].CreatedAt > chatModels[j].CreatedAt
		}
		return chatModels[i].ID < chatModels[j].ID
	})

	result := make([]AiModel, 0, len(chatModels))
	for _, model := range chatModels {
		result = append(result, AiModel{Name: model.ID, DisplayName: model.ID})
	}
	return result, nil
}

var openAiReasoningModelPattern = regexp.MustCompile(`^o\d`)

var openAiNonChatMarkers = []string{
	"audio", "realtime", "tts", "transcribe", "search", "image", "embedding", "instruct", "moderation", "codex",
}

// isOpenAiChatModel keeps the GPT and o-series chat models.
func isOpenAiChatModel(id string) bool {
	name := strings.ToLower(id)
	if !strings.HasPrefix(name, "gpt-") && !strings.HasPrefix(name, "chatgpt-") && !openAiReasoningModelPattern.MatchString(name) {
		return false
	}
	for _, marker := range openAiNonChatMarkers {
		if strings.Contains(name, marker) {
			return false
		}
	}
	return true
}

func isRefusedKeyStatus(status int) bool {
	return status == 400 || status == 401 || status == 403
}
