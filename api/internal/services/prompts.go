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
// only shaped by the group's categories and tags through @categories and @tags). Stored Prompt rows
// are kept, and a processing setting still names one, but buildPrompt no longer reads it.
const DefaultReceiptPrompt = `
Find the receipt's name, total cost, and date. Format the found data as:
{
	"name": store name,
	"shopName": the shop brand as printed, like Auchan, Edeka or Rewe (only the brand, "" if unreadable),
	"amount": amount as a number,
	"date": date in ISO 18601 format in UTC with ALL time values set as 0,
	"categories": categories,
	"tags": tags,
	"customFields": custom field values
}
If a store name cannot be confidently found, use 'Default store name' as the default name.
Omit any value if not found with confidence. Assume the date is in the year @currentYear if not provided.
The amount must be a float or integer.
If the receipt represents a refund, return, or credit (money returned to the customer rather than charged), the amount and item amounts MUST be negative. Otherwise they are positive.

Please do NOT add any additional information, only valid JSON.
Please return the json in plaintext ONLY, do not ever return it in a code block or any other format.

Choose up to 2 categories from the given list based on the receipt's items and store name. If no categories fit, please return an empty array for the field and do not select any categories. When selecting categories, select only the id, like:
{
	Id: category id
}

Emphasize the relationship between the category and the receipt, and use the description of the category to fine tune the results. Do not return categories that have an empty name or do not exist.
If there are no categories to chose from, then please make categories an empty array.
Likewise, if there are not tags to choose from, then make tags an empty array.

Categories to chose from: @categories

Follow the same process as described for categories for tags.

Tags to chose from: @tags

Custom fields to fill in, as a list of {id, name, type, description, options}. Return a value for a field only when the receipt clearly shows it; otherwise leave it out. If there are no custom fields, make customFields an empty array. Each value is an object with the field's id as customFieldId and exactly one value, by type:
TEXT: "stringValue": text
DATE: "dateValue": the date as yyyy-MM-dd
SELECT: "selectValue": the id of one of the field's options
CURRENCY: "currencyValue": amount as a number
BOOLEAN: "booleanValue": true or false

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
