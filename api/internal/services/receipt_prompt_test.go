package services

import (
	"strings"
	"testing"
)

func TestDefaultReceiptPromptIncludesRefundGuidance(t *testing.T) {
	if !strings.Contains(DefaultReceiptPrompt, "refund") {
		t.Errorf("the prompt should instruct the model on refund/return amount sign; got: %s", DefaultReceiptPrompt)
	}

	if !strings.Contains(DefaultReceiptPrompt, "negative") {
		t.Errorf("the prompt should mention negative amounts; got: %s", DefaultReceiptPrompt)
	}
}
