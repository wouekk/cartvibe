package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"strings"

	"gorm.io/gorm"
)

// aiLanguageNames are the languages a person can ask the AI to write in, by the codes the desktop offers. A prompt
// names the language in English ("Polish"), which every model follows best.
var aiLanguageNames = map[string]string{
	"en": "English",
	"pl": "Polish",
	"de": "German",
	"fr": "French",
	"es": "Spanish",
}

// defaultAiLanguage is used for a system run (no person) and for any code without a name above.
const defaultAiLanguage = "English"

// aiLanguageName maps a language code ("pl", "pl-pl") to its English name, English when unknown.
func aiLanguageName(code string) string {
	code = strings.ToLower(strings.TrimSpace(code))
	if base, _, found := strings.Cut(code, "-"); found {
		code = base
	}
	if name, ok := aiLanguageNames[code]; ok {
		return name
	}
	return defaultAiLanguage
}

// AiAnswerLanguage is the language the AI writes product names and new categories in for this person: their AI
// language (Settings → Language), else their interface language, else English. userId 0 (a system run) is English.
// It never fails a read: a missing row or a database error answers English.
func AiAnswerLanguage(tx *gorm.DB, userId uint) string {
	if userId == 0 {
		return defaultAiLanguage
	}

	if tx == nil {
		tx = repositories.GetDB()
	}

	var preferences models.UserPrefernces
	err := tx.Model(&models.UserPrefernces{}).Select("language", "ai_language").Where("user_id = ?", userId).Take(&preferences).Error
	if err != nil {
		return defaultAiLanguage
	}
	if preferences.AiLanguage != "" {
		return aiLanguageName(preferences.AiLanguage)
	}
	return aiLanguageName(preferences.Language)
}

// receiptAuthor is the person a receipt's AI text is written for: who added it, else who paid (an older or
// imported receipt may have no author).
func receiptAuthor(receipt models.Receipt) uint {
	if receipt.CreatedBy != nil && *receipt.CreatedBy > 0 {
		return *receipt.CreatedBy
	}
	return receipt.PaidByUserID
}
