package services

import (
	"strings"

	"cartvibe/api/internal/structs"
)

// The shapes of the two receipt answers, as JSON Schema. A provider that is given one writes JSON of that shape
// (structs.AiChatCompletionOptions.ResponseSchema), so the answer needs no repair before it is parsed.
//
// They mirror the prompts key for key: the receipt answer of DefaultReceiptPrompt (with the products of
// inlineProductPromptTemplate when a quick scan asks for them) and the product answer of
// productExtractionPromptTemplate. A key the prompt asks for and the schema lacks would be dropped by the
// provider without a word, so ai_answer_schemas_test.go reads the keys out of the prompts and compares.
//
// Only "name" and "products" are required. The prompts tell the model to leave out what it could not read, which
// also keeps the answer short (the output tokens set most of a read's wait).

func aiProductLineSchema() map[string]any {
	text := map[string]any{"type": "string"}
	return map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]any{
			"name":        text,
			"displayName": text,
			"amount":      map[string]any{"type": "number"},
			"quantity":    text,
			"health":      text,
			"foodGroup":   text,
			"seasonality": text,
		},
		"required": []string{"name"},
	}
}

// receiptAnswerSchema is the answer of a receipt read; withProducts adds the product lines a quick scan asks for
// in the same answer.
func receiptAnswerSchema(withProducts bool) *structs.AiResponseSchema {
	text := map[string]any{"type": "string"}
	properties := map[string]any{
		"name":     text,
		"shopName": text,
		"currency": text,
		"amount":   map[string]any{"type": "number"},
		"date":     text,
		"categories": map[string]any{
			"type": "array",
			"items": map[string]any{
				"type":                 "object",
				"additionalProperties": false,
				"properties":           map[string]any{"id": map[string]any{"type": "integer"}},
				"required":             []string{"id"},
			},
		},
	}
	if withProducts {
		properties["products"] = map[string]any{"type": "array", "items": aiProductLineSchema()}
	}

	return &structs.AiResponseSchema{
		Name: "receipt",
		Schema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties":           properties,
			"required":             []string{"name"},
		},
	}
}

// productAnswerSchema is the answer of a product read (the sweep, and Read again).
func productAnswerSchema() *structs.AiResponseSchema {
	text := map[string]any{"type": "string"}
	return &structs.AiResponseSchema{
		Name: "receipt_products",
		Schema: map[string]any{
			"type":                 "object",
			"additionalProperties": false,
			"properties": map[string]any{
				"shop":     text,
				"currency": text,
				"products": map[string]any{"type": "array", "items": aiProductLineSchema()},
			},
			"required": []string{"products"},
		},
	}
}

// promptAsksForProducts is true for a receipt prompt that carries the inline product part.
func promptAsksForProducts(prompt string) bool {
	return strings.Contains(prompt, `Also add a "products" key`)
}
