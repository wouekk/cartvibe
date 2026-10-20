package structs

type PromptTemplateVariable string

const (
	CATEGORIES    PromptTemplateVariable = "@categories"
	TAGS          PromptTemplateVariable = "@tags"
	CUSTOM_FIELDS PromptTemplateVariable = "@customFields"
	OCR_TEXT      PromptTemplateVariable = "@ocrText"
	CURRENT_YEAR  PromptTemplateVariable = "@currentYear"
)
