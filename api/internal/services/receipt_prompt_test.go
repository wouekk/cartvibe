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

// A shop inside a shopping centre is named by its own brand, never the centre's, and a name that is only a logo is read
// from it. Both prompts that name the shop (the receipt read and the product sweep) share the one rule, so they
// cannot disagree about the same receipt.
func TestShopNameRuleIsInBothPrompts(t *testing.T) {
	for name, prompt := range map[string]string{
		"receipt read":  DefaultReceiptPrompt,
		"product sweep": productExtractionPromptTemplate,
	} {
		if !strings.Contains(prompt, shopRule) {
			t.Errorf("%s prompt should carry shopRule; got: %s", name, prompt)
		}
	}

	for _, want := range []string{"never the shopping centre", "logo"} {
		if !strings.Contains(shopRule, want) {
			t.Errorf("shopRule should mention %q; got: %s", want, shopRule)
		}
	}
}

// Prompts are billed by the token on every receipt: keep the shop rule to one short sentence. A rough guard (about 4
// characters a token), so growing it needs a deliberate edit of this number.
func TestShopNameRuleStaysShort(t *testing.T) {
	if len(shopRule) > 220 {
		t.Errorf("shopRule is %d characters; keep it under 220 (it is sent with every receipt)", len(shopRule))
	}
}
