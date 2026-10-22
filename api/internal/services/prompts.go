package services

import (
	"errors"
	"gorm.io/gorm"
	"receipt-wrangler/api/internal/commands"
	"receipt-wrangler/api/internal/constants"
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
)

type PromptService struct {
	BaseService
}

func NewPromptService(tx *gorm.DB) PromptService {
	service := PromptService{BaseService: BaseService{
		DB: repositories.GetDB(),
		TX: tx,
	}}
	return service
}

// DefaultReceiptPrompt is the prompt every receipt read uses (Phase 3 A3: prompts are hardcoded and
// only shaped by the group's categories through @categories). Stored Prompt rows are kept, and a
// processing setting still names one, but buildPrompt no longer reads it. It asks for no tags: tags are
// the household's own labels, set by people (the AI's answer is stripped of any, see dropAiTags).
//
// Short on purpose (fewer input tokens), and the answer is minified JSON (fewer output tokens, which set
// most of the latency). buildPrompt inserts the products part right before "\nReceipt text: ".
const DefaultReceiptPrompt = `
Read this shop receipt. Reply with minified JSON only, no code block:
{"name":"...","shopName":"...","currency":"...","amount":0.0,"date":"2024-01-31T00:00:00Z","categories":[{"id":1}],"customFields":[]}
- "name": the store name; "Default store name" if unreadable.
- "shopName": the shop brand only (Auchan, Edeka, Rewe); "" if unreadable.
- "currency": ` + currencyRule + `
- "amount": the total paid, a number. A refund, return or credit (money back to the customer) is negative.
- "date": the purchase day at midnight UTC, in exactly that format; the year is @currentYear if not printed.
- "categories": up to 2 category ids from the list below that fit the store and what was bought, using their descriptions; [] if none fits. Never invent an id.
- "customFields": a value only for a field the receipt clearly shows: {"customFieldId":id} plus one of "stringValue" (TEXT), "dateValue" yyyy-MM-dd (DATE), "selectValue" an option id (SELECT), "currencyValue" a number (CURRENCY), "booleanValue" (BOOLEAN); [] if none.
Leave out any other value you cannot read with confidence.

Categories: @categories
Custom fields: @customFields

Receipt text: @ocrText
`

func (service PromptService) CreateDefaultPrompt() (models.Prompt, error) {
	db := service.GetDB()
	var defaultPromptCount int64
	db.Model(models.Prompt{}).Where("name = ?", constants.DefaultPromptName).Count(&defaultPromptCount)

	if defaultPromptCount > 0 {
		return models.Prompt{}, errors.New("default prompt already exists")
	}

	promptRepository := repositories.NewPromptRepository(service.TX)
	command := commands.UpsertPromptCommand{
		Name:        constants.DefaultPromptName,
		Description: "Default prompt used for previous versions of Receipt Wrangler.",
		Prompt:      DefaultReceiptPrompt,
	}

	return promptRepository.CreatePrompt(command)
}

// EnsureDefaultPrompt returns the stored default prompt, creating it on first use. A processing
// setting still has to point at a prompt row (a foreign key), though buildPrompt no longer reads it.
func (service PromptService) EnsureDefaultPrompt() (models.Prompt, error) {
	var prompt models.Prompt
	err := service.GetDB().Model(models.Prompt{}).Where("name = ?", constants.DefaultPromptName).Limit(1).Find(&prompt).Error
	if err != nil {
		return models.Prompt{}, err
	}
	if prompt.ID > 0 {
		return prompt, nil
	}

	return service.CreateDefaultPrompt()
}
