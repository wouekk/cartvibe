package wranglerasynq

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"testing"
)

func TestShouldRenderEmailBodyPdfForGroup_NoHtmlBody(t *testing.T) {
	metadata := structs.EmailMetadata{
		Body:     "plain text only",
		BodyHtml: "",
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if shouldRenderEmailBodyPdfForGroup(metadata, 1, lookup) {
		t.Error("expected false when BodyHtml is empty")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_HtmlPresentAndGroupEnabled(t *testing.T) {
	metadata := structs.EmailMetadata{
		Body:     "order",
		BodyHtml: "<p>order</p>",
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if !shouldRenderEmailBodyPdfForGroup(metadata, 1, lookup) {
		t.Error("expected true when HTML present with meaningful body and group enabled")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_HtmlPresentButGroupDisabled(t *testing.T) {
	metadata := structs.EmailMetadata{
		Body:     "order",
		BodyHtml: "<p>order</p>",
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: false},
	}

	if shouldRenderEmailBodyPdfForGroup(metadata, 1, lookup) {
		t.Error("expected false when group has body processing disabled")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_GroupMissingFromLookup(t *testing.T) {
	metadata := structs.EmailMetadata{
		Body:     "order",
		BodyHtml: "<p>order</p>",
	}
	lookup := map[uint]models.GroupSettings{}

	if shouldRenderEmailBodyPdfForGroup(metadata, 99, lookup) {
		t.Error("expected false when group settings can't be resolved")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_OtherGroupEnabledDoesNotImply(t *testing.T) {
	// A different group having body processing enabled must not enable rendering
	// for a group that does not.
	metadata := structs.EmailMetadata{
		Body:     "order",
		BodyHtml: "<p>order</p>",
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
		2: {EmailBodyProcessingEnabled: false},
	}

	if shouldRenderEmailBodyPdfForGroup(metadata, 2, lookup) {
		t.Error("expected per-group decision to be independent of other groups")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_EmptyWrapperHtmlSkipped(t *testing.T) {
	// Gmail's web composer auto-wraps every outbound message in a boilerplate
	// HTML shell even when the user typed nothing:
	//   <html><head><meta></head><body><div style="..."></div></body></html>
	// BodyHtml is non-empty but the stripped text (Body) is all whitespace.
	// Rendering that wrapper produces a near-blank PDF that only confuses the
	// LLM — skip it.
	metadata := structs.EmailMetadata{
		Body:     "",
		BodyHtml: `<html><head><meta name="viewport" content="width=device-width"></head><body><div style="font-family: sans-serif;"></div></body></html>`,
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if shouldRenderEmailBodyPdfForGroup(metadata, 1, lookup) {
		t.Error("expected false when BodyHtml is only a wrapper with no meaningful text")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_WhitespaceOnlyBodySkipped(t *testing.T) {
	// Stricter variant: Body stripped down to only whitespace (newlines, tabs,
	// spaces) should also be treated as no meaningful content.
	metadata := structs.EmailMetadata{
		Body:     "   \n\t\n   ",
		BodyHtml: "<html><body></body></html>",
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if shouldRenderEmailBodyPdfForGroup(metadata, 1, lookup) {
		t.Error("expected false when Body is whitespace-only")
	}
}
