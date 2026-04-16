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
		BodyHtml: "<p>order</p>",
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if !shouldRenderEmailBodyPdfForGroup(metadata, 1, lookup) {
		t.Error("expected true when HTML present and group enabled")
	}
}

func TestShouldRenderEmailBodyPdfForGroup_HtmlPresentButGroupDisabled(t *testing.T) {
	metadata := structs.EmailMetadata{
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
