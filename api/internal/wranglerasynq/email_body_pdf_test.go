package wranglerasynq

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/structs"
	"testing"
)

func TestShouldRenderEmailBodyPdf_NoHtmlBody(t *testing.T) {
	metadata := structs.EmailMetadata{
		Body:             "plain text only",
		BodyHtml:         "",
		GroupSettingsIds: []uint{1},
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if shouldRenderEmailBodyPdf(metadata, lookup) {
		t.Error("expected false when BodyHtml is empty")
	}
}

func TestShouldRenderEmailBodyPdf_HtmlPresentAndGroupEnabled(t *testing.T) {
	metadata := structs.EmailMetadata{
		BodyHtml:         "<p>order</p>",
		GroupSettingsIds: []uint{1},
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: true},
	}

	if !shouldRenderEmailBodyPdf(metadata, lookup) {
		t.Error("expected true when HTML present and group enabled")
	}
}

func TestShouldRenderEmailBodyPdf_HtmlPresentButAllGroupsDisabled(t *testing.T) {
	metadata := structs.EmailMetadata{
		BodyHtml:         "<p>order</p>",
		GroupSettingsIds: []uint{1, 2},
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: false},
		2: {EmailBodyProcessingEnabled: false},
	}

	if shouldRenderEmailBodyPdf(metadata, lookup) {
		t.Error("expected false when all consuming groups have body processing disabled")
	}
}

func TestShouldRenderEmailBodyPdf_AnyOneGroupEnabledIsEnough(t *testing.T) {
	metadata := structs.EmailMetadata{
		BodyHtml:         "<p>order</p>",
		GroupSettingsIds: []uint{1, 2, 3},
	}
	lookup := map[uint]models.GroupSettings{
		1: {EmailBodyProcessingEnabled: false},
		2: {EmailBodyProcessingEnabled: false},
		3: {EmailBodyProcessingEnabled: true},
	}

	if !shouldRenderEmailBodyPdf(metadata, lookup) {
		t.Error("expected true when at least one group has body processing enabled")
	}
}

func TestShouldRenderEmailBodyPdf_GroupNotInLookup(t *testing.T) {
	metadata := structs.EmailMetadata{
		BodyHtml:         "<p>order</p>",
		GroupSettingsIds: []uint{99},
	}
	lookup := map[uint]models.GroupSettings{}

	if shouldRenderEmailBodyPdf(metadata, lookup) {
		t.Error("expected false when no group settings can be resolved")
	}
}
