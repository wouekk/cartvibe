package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"cartvibe/api/internal/constants"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

// DefaultAnthropicModel is what a new Claude setting starts on; the AI page lists the others the key can use.
const DefaultAnthropicModel = "claude-opus-5-5"

// anthropicMaxTokens leaves room for a long receipt's product list. Current Claude models think before they
// answer, and the thinking counts toward it too.
const anthropicMaxTokens = 16000

// anthropicHttpClient is shared by every call, so connections to Anthropic are reused.
var anthropicHttpClient = &http.Client{Timeout: constants.AiHttpTimeout}

// anthropicBaseUrl overrides Anthropic's endpoint; tests point it at a local server. Empty means Anthropic.
var anthropicBaseUrl = ""

type AnthropicClient struct {
	BaseClient
}

func NewAnthropicClient(
	options structs.AiChatCompletionOptions,
	receiptProcessingSettings models.ReceiptProcessingSettings,
) *AnthropicClient {
	return &AnthropicClient{
		BaseClient{
			Options:                   options,
			ReceiptProcessingSettings: receiptProcessingSettings,
		},
	}
}

// newAnthropicSdkClient builds the SDK client for a key. Its own retries are off: the sweeps and quick scan
// already retry and count every try (at most three), as with Gemini.
func newAnthropicSdkClient(key string) anthropic.Client {
	options := []option.RequestOption{
		option.WithAPIKey(key),
		option.WithHTTPClient(anthropicHttpClient),
		option.WithMaxRetries(0),
	}
	if anthropicBaseUrl != "" {
		options = append(options, option.WithBaseURL(anthropicBaseUrl))
	}
	return anthropic.NewClient(options...)
}

// GetChatCompletion sends the messages to Claude. No temperature is sent: current Claude models only accept
// their default and answer 400 to any other value. Images arrive base64-encoded, without a data URI prefix.
func (claude AnthropicClient) GetChatCompletion() (structs.ChatCompletionResult, error) {
	result := structs.ChatCompletionResult{}

	key, err := claude.getKey(claude.Options.DecryptKey)
	if err != nil {
		return result, err
	}

	messages := make([]anthropic.MessageParam, 0, len(claude.Options.Messages))
	for _, message := range claude.Options.Messages {
		blocks := make([]anthropic.ContentBlockParamUnion, 0, len(message.Images)+1)
		for _, image := range message.Images {
			imageBytes, err := utils.Base64Decode(image)
			if err != nil {
				return result, err
			}
			blocks = append(blocks, anthropic.NewImageBlockBase64(utils.GetMimeType(imageBytes).String(), image))
		}
		blocks = append(blocks, anthropic.NewTextBlock(message.Content))

		if message.Role == "assistant" {
			messages = append(messages, anthropic.NewAssistantMessage(blocks...))
		} else {
			messages = append(messages, anthropic.NewUserMessage(blocks...))
		}
	}

	model := strings.TrimSpace(claude.ReceiptProcessingSettings.Model)
	if model == "" {
		model = DefaultAnthropicModel
	}

	client := newAnthropicSdkClient(key)
	resp, err := client.Messages.New(context.Background(), anthropic.MessageNewParams{
		Model:     anthropic.Model(model),
		MaxTokens: anthropicMaxTokens,
		Messages:  messages,
	})
	if err != nil {
		return result, err
	}

	result.RawResponse = resp.RawJSON()
	if resp.RawJSON() == "" {
		responseBytes, _ := json.Marshal(resp)
		result.RawResponse = string(responseBytes)
	}

	// A declined request is an error, so the backup AI (when one is set) gets the receipt instead.
	if resp.StopReason == anthropic.StopReasonRefusal {
		return result, errors.New("Claude declined to answer")
	}

	var text strings.Builder
	for _, block := range resp.Content {
		if textBlock, ok := block.AsAny().(anthropic.TextBlock); ok {
			text.WriteString(textBlock.Text)
		}
	}
	if text.Len() == 0 {
		return result, fmt.Errorf("empty answer from Claude (stop reason %s)", resp.StopReason)
	}
	result.Response = stripJsonFence(text.String())

	return result, nil
}

// stripJsonFence removes a ```json ... ``` fence around an answer. Claude has no JSON-only switch like OpenAI's
// response format, and the product and classification parsers expect bare JSON.
func stripJsonFence(answer string) string {
	trimmed := strings.TrimSpace(answer)
	if !strings.HasPrefix(trimmed, "```") || !strings.HasSuffix(trimmed, "```") || len(trimmed) < 6 {
		return answer
	}
	inner := strings.TrimSuffix(strings.TrimPrefix(trimmed, "```"), "```")
	if newline := strings.IndexByte(inner, '\n'); newline >= 0 && !strings.ContainsAny(inner[:newline], "{[") {
		inner = inner[newline+1:]
	}
	return strings.TrimSpace(inner)
}
