package ai

import (
	"sync"

	"cartvibe/api/internal/models"
)

// The structured settings a call may carry (a response schema, Claude's effort, Gemini's thinking setting) are
// each provider's own, and the model is whatever the household typed: an older model, or an OpenAI-compatible
// server on someone's desk, can answer 400 to a setting it does not know. Such a call is asked once more without
// them, and plainAnswers remembers the model for as long as the process lives, so only the first call pays for the
// refusal. A restart tries the settings again, which is how a model that learned them gets them back.
var plainAnswers sync.Map

func plainAnswerKey(settings models.ReceiptProcessingSettings) string {
	return string(settings.AiType) + "|" + settings.Url + "|" + settings.Model
}

// wantsPlainAnswer is true for a model that refused the structured settings earlier in this process.
func wantsPlainAnswer(settings models.ReceiptProcessingSettings) bool {
	_, refused := plainAnswers.Load(plainAnswerKey(settings))
	return refused
}

func rememberPlainAnswer(settings models.ReceiptProcessingSettings) {
	plainAnswers.Store(plainAnswerKey(settings), true)
}

// forgetPlainAnswers is for tests: each starts with nothing remembered.
func forgetPlainAnswers() {
	plainAnswers.Range(func(key, _ any) bool {
		plainAnswers.Delete(key)
		return true
	})
}
