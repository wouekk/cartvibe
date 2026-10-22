package ai

import (
	"cartvibe/api/internal/structs"
)

type Client interface {
	GetChatCompletion() (structs.ChatCompletionResult, error)
}
