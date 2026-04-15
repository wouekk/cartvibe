package services

import (
	"receipt-wrangler/api/internal/repositories"
	"strings"
	"testing"
)

func tearDownPromptsTest() {
	repositories.TruncateTestDb()
}

func TestCreateDefaultPromptIncludesRefundGuidance(t *testing.T) {
	defer tearDownPromptsTest()

	service := NewPromptService(nil)
	prompt, err := service.CreateDefaultPrompt()
	if err != nil {
		t.Fatalf("unexpected error creating default prompt: %v", err)
	}

	if !strings.Contains(prompt.Prompt, "refund") {
		t.Errorf("default prompt should instruct the model on refund/return amount sign; got: %s", prompt.Prompt)
	}

	if !strings.Contains(prompt.Prompt, "negative") {
		t.Errorf("default prompt should mention negative amounts; got: %s", prompt.Prompt)
	}
}
