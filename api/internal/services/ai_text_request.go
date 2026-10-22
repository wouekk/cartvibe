package services

import (
	"gorm.io/gorm"
	"cartvibe/api/internal/logging"
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/structs"
	"cartvibe/api/internal/utils"
)

// textAiOutcome is how asking the group's AI a text-only question went.
type textAiOutcome int

const (
	// The group has no AI in its receipt processing settings.
	textAiNotConfigured textAiOutcome = iota
	// No AI could be reached (out of credits, down, network): an outage, retried later.
	textAiUnreachable
	// An AI answered, but nothing it said could be read.
	textAiUnreadable
	textAiAnswered
)

// askTextAi sends one prompt to the group's AI, then to its fallback, until an answer passes parse.
// parse receives the cleaned-up response and returns an error when it cannot use it. lastErr is the
// last failure, for recording on whatever is waiting.
func askTextAi(tx *gorm.DB, groupId uint, prompt string, logPrefix string, parse func(cleaned string) error) (outcome textAiOutcome, lastErr error) {
	processingService, err := NewSystemReceiptProcessingService(tx, utils.UintToString(groupId))
	if err != nil || processingService.ReceiptProcessingSettings.ID == 0 {
		return textAiNotConfigured, errNoAiConfigured
	}

	candidates := []models.ReceiptProcessingSettings{processingService.ReceiptProcessingSettings}
	if processingService.FallbackReceiptProcessingSettings.ID > 0 {
		candidates = append(candidates, processingService.FallbackReceiptProcessingSettings)
	}

	outcome = textAiUnreachable
	for _, settings := range candidates {
		aiService := AiService{ReceiptProcessingSettings: settings}
		response, _, callErr := aiService.CreateChatCompletion(structs.AiChatCompletionOptions{
			Messages:   []structs.AiClientMessage{{Role: "user", Content: prompt}},
			DecryptKey: true,
		})
		if callErr != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, logPrefix+": AI call failed: "+callErr.Error())
			if outcome == textAiUnreachable {
				lastErr = callErr
			}
			continue
		}

		parseErr := parse(processingService.cleanResponse(response))
		if parseErr != nil {
			logging.LogStd(logging.LOG_LEVEL_ERROR, logPrefix+": unreadable answer: "+parseErr.Error())
			// An answer, even an unreadable one, means the AI was reachable.
			outcome = textAiUnreadable
			lastErr = parseErr
			continue
		}

		return textAiAnswered, nil
	}

	return outcome, lastErr
}
