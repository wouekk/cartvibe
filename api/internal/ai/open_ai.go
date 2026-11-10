package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"

	"github.com/sashabaranov/go-openai"
)

// openAiTimeout bounds one call to OpenAI itself, like the other hosted providers' AiHttpTimeout; tests shorten it.
var openAiTimeout time.Duration = constants.AiHttpTimeout

// openAiCompatibleTimeout bounds one call to an OpenAI-compatible server at a URL the household entered, which is
// often a model running on its own machine (LM Studio and the like) and far slower.
var openAiCompatibleTimeout time.Duration = constants.AiLocalHttpTimeout

type OpenAiClient struct {
	BaseClient
}

func NewOpenAiClient(
	options structs.AiChatCompletionOptions,
	receiptProcessingSettings models.ReceiptProcessingSettings,
) *OpenAiClient {
	return &OpenAiClient{
		BaseClient{
			Options:                   options,
			ReceiptProcessingSettings: receiptProcessingSettings,
		},
	}
}

func (openAi OpenAiClient) GetChatCompletion() (structs.ChatCompletionResult, error) {
	result := structs.ChatCompletionResult{}

	key, err := openAi.getKey(openAi.Options.DecryptKey)
	if err != nil {
		return result, err
	}

	// The configured URL is used verbatim as an OpenAI-compatible base URL, with no
	// provider-specific rewriting. Providers that serve their compatible API under a path
	// must include it, e.g. https://<resource>.services.ai.azure.com/openai/v1 for Azure.
	config := openai.DefaultConfig(key)
	if len(openAi.ReceiptProcessingSettings.Url) > 0 {
		config.BaseURL = openAi.ReceiptProcessingSettings.Url
	}
	timeout := openAiTimeout
	if openAi.ReceiptProcessingSettings.AiType == models.OPEN_AI_CUSTOM_NEW {
		timeout = openAiCompatibleTimeout
	}
	config.HTTPClient = &http.Client{Timeout: timeout}
	client := openai.NewClientWithConfig(config)

	openAiMessages := make([]openai.ChatCompletionMessage, len(openAi.Options.Messages))

	if len(openAi.Options.Messages) > 0 && len(openAi.Options.Messages[0].Images) > 0 {
		for i, message := range openAi.Options.Messages {
			chatParts := make([]openai.ChatMessagePart, 1+len(message.Images))

			chatParts[0] = openai.ChatMessagePart{
				Type: openai.ChatMessagePartTypeText,
				Text: message.Content,
			}
			for j, image := range message.Images {
				imageUrl := openai.ChatMessageImageURL{
					URL:    image,
					Detail: openai.ImageURLDetailAuto,
				}

				imagePart := openai.ChatMessagePart{
					Type:     openai.ChatMessagePartTypeImageURL,
					ImageURL: &imageUrl,
				}

				chatParts[j+1] = imagePart
			}

			openAiMessages[i] = openai.ChatCompletionMessage{
				Role:         message.Role,
				MultiContent: chatParts,
			}
		}
	} else if len(openAi.Options.Messages) > 0 {
		for index, message := range openAi.Options.Messages {
			openAiMessages[index] = openai.ChatCompletionMessage{
				Role:    message.Role,
				Content: message.Content,
			}
		}
	}

	model := strings.TrimSpace(openAi.ReceiptProcessingSettings.Model)
	if len(model) == 0 {
		return result, ErrNoModelChosen
	}

	request := openai.ChatCompletionRequest{
		Model:       model,
		Messages:    openAiMessages,
		N:           1,
		Temperature: 0,
	}

	if openAi.ReceiptProcessingSettings.EnforceJsonResponseFormat {
		request.ResponseFormat = &openai.ChatCompletionResponseFormat{
			Type: openai.ChatCompletionResponseFormatTypeJSONObject,
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	resp, err := client.CreateChatCompletion(ctx, request)
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
	if len(resp.Choices) == 0 {
		return result, errors.New("empty choices from provider")
	}
	result.Response = resp.Choices[0].Message.Content
	return result, nil
}
