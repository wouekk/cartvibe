package structs

type AiClientMessage struct {
	Role    string   `json:"role"`
	Content string   `json:"content"`
	Images  []string `json:"images"`
}

type AiChatCompletionOptions struct {
	// Messages to send to the AI model
	Messages []AiClientMessage `json:"messages"`

	// Determines whether to decrypt the key
	DecryptKey bool `json:"decryptKey"`

	// ResponseSchema, when set, is the shape the answer must have. Each provider is asked for it through its own
	// structured-output setting, so the answer is JSON of that shape rather than text that has to be repaired. A
	// model or server that refuses the setting is asked again without it (ai.plainAnswers remembers which).
	ResponseSchema *AiResponseSchema `json:"-"`
}

// AiResponseSchema is a JSON Schema for an answer, with the name some providers want for it. Keep to what all of
// them take: objects with "additionalProperties": false, arrays, strings, numbers and integers.
type AiResponseSchema struct {
	Name   string
	Schema map[string]any
}
