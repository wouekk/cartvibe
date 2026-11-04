package services

import (
	"strings"
	"testing"
	"time"

	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
)

func TestAiLanguageNameMapsTheOfferedCodes(t *testing.T) {
	for code, want := range map[string]string{
		"en": "English", "pl": "Polish", "PL": "Polish", "pl-pl": "Polish", "de": "German", "fr": "French",
		"es": "Spanish", "pt-br": "English", "": "English", "junk": "English",
	} {
		if got := aiLanguageName(code); got != want {
			t.Errorf("aiLanguageName(%q) = %q, want %q", code, got, want)
		}
	}
}

// A person's AI language wins; without one their interface language is used; without either, and for a system
// run or an unknown person, the AI writes English.
func TestAiAnswerLanguageFollowsThePersonsChoice(t *testing.T) {
	defer repositories.TruncateTestDb()
	repositories.CreateTestUser()

	db := repositories.GetDB()
	if got := AiAnswerLanguage(db, 1); got != "English" {
		t.Errorf("no preferences: got %q, want English", got)
	}

	preferences := models.UserPrefernces{UserId: 1, Language: "de"}
	if err := db.Create(&preferences).Error; err != nil {
		t.Fatal(err)
	}
	if got := AiAnswerLanguage(db, 1); got != "German" {
		t.Errorf("interface language only: got %q, want German", got)
	}

	if err := db.Model(&models.UserPrefernces{}).Where("user_id = ?", 1).Update("ai_language", "pl").Error; err != nil {
		t.Fatal(err)
	}
	if got := AiAnswerLanguage(db, 1); got != "Polish" {
		t.Errorf("AI language set: got %q, want Polish", got)
	}
	if got := AiAnswerLanguage(nil, 1); got != "Polish" {
		t.Errorf("a service without a transaction reads the shared database: got %q, want Polish", got)
	}

	if got := AiAnswerLanguage(db, 0); got != "English" {
		t.Errorf("system run: got %q, want English", got)
	}
	if got := AiAnswerLanguage(db, 999); got != "English" {
		t.Errorf("unknown person: got %q, want English", got)
	}
}

func TestReceiptAuthorPrefersWhoAddedTheReceipt(t *testing.T) {
	author := uint(3)
	if got := receiptAuthor(models.Receipt{BaseModel: models.BaseModel{CreatedBy: &author}, PaidByUserID: 2}); got != 3 {
		t.Errorf("got %d, want the author 3", got)
	}
	if got := receiptAuthor(models.Receipt{PaidByUserID: 2}); got != 2 {
		t.Errorf("got %d, want the payer 2 when there is no author", got)
	}
}

// The product prompts ask for display names, and new categories when the household has no list, in the person's
// language; the category list and everything else stay as they were.
func TestProductPromptsNameTheAnswerLanguage(t *testing.T) {
	month := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)

	withoutList := buildProductExtractionPrompt(month, "", nil, "Polish")
	for _, want := range []string{`"displayName": a short plain name in Polish`, "a short lowercase category in Polish"} {
		if !strings.Contains(withoutList, want) {
			t.Errorf("prompt without a category list should contain %q", want)
		}
	}

	withList := buildInlineProductPrompt(month, "Choose \"foodGroup\" from these categories: Nabiał.", nil, "Polish")
	if !strings.Contains(withList, `"displayName": a short plain name in Polish`) {
		t.Error("inline prompt should ask for display names in Polish")
	}
	if strings.Contains(withList, "a short lowercase category in") {
		t.Error("with a category list the prompt must not invite new category names")
	}
}
