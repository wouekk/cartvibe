package services

import (
	"strings"
	"testing"

	"cartvibe/api/internal/commands"
	"github.com/shopspring/decimal"
)

// What a receipt is written with must reach the AI: dates, times, amounts, rates, currency signs and shop names. The
// blacklist may only hold characters that are misread smudges.
func TestOcrCharBlacklistKeepsWhatReceiptsAreWrittenWith(t *testing.T) {
	for _, sample := range []string{
		"2026-11-09", "09/11/2026", "09.11.2026", "14:35", "-20%", "VAT 23%", "12,50", "12.50",
		"$4.99", "€", "zł", "H&M", "McDonald's", "2 x 3,99", "*", "#12", "(A)", "1+1", "=",
	} {
		if strings.ContainsAny(sample, ocrCharBlacklist) {
			t.Errorf("%q would lose a character to the OCR blacklist %q", sample, ocrCharBlacklist)
		}
	}
}

// Only the six things the prompt asks for are taken from an AI's answer; who paid, the status, the household, the
// note and the tags are never the AI's to set.
func TestOnlyPromptedReceiptFieldsDropsEverythingThePromptDoesNotAskFor(t *testing.T) {
	userId := uint(9)
	original := decimal.NewFromInt(7)
	aiNote := "from the AI"
	answer := commands.UpsertReceiptCommand{
		Name:             "Lidl",
		ShopName:         "Lidl",
		Currency:         "zł",
		Amount:           decimal.RequireFromString("43.21"),
		GroupId:          5,
		PaidByUserID:     9,
		Status:           "RESOLVED",
		OriginalAmount:   &original,
		OriginalCurrency: "USD",
		ExchangeRate:     &original,
		CreatedByString:  "somebody",
		Categories:       []commands.UpsertCategoryCommand{{Id: &userId}},
		Tags:             []commands.UpsertTagCommand{{Name: "from the AI"}},
		Note:             &aiNote,
	}

	kept := onlyPromptedReceiptFields(answer)

	if kept.Name != "Lidl" || kept.ShopName != "Lidl" || kept.Currency != "zł" || !kept.Amount.Equal(answer.Amount) || len(kept.Categories) != 1 {
		t.Errorf("the prompted fields must be kept, got %+v", kept)
	}
	if kept.GroupId != 0 || kept.PaidByUserID != 0 || kept.Status != "" || kept.CreatedByString != "" ||
		kept.OriginalAmount != nil || kept.OriginalCurrency != "" || kept.ExchangeRate != nil || kept.Note != nil {
		t.Errorf("fields the prompt does not ask for must be dropped, got %+v", kept)
	}
	if kept.Tags == nil || len(kept.Tags) != 0 {
		t.Errorf("tags must be an empty list, never null and never the AI's, got %#v", kept.Tags)
	}
}
