package services

import (
	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
	"strings"
	"testing"
)

func TestParseShopName(t *testing.T) {
	cases := map[string]string{
		`{"shop": "Auchan", "products": []}`:           "Auchan",
		`{"shop": "  Edeka  ", "products": []}`:        "Edeka",
		`{"products": []}`:                             "",
		`{"shop": null, "products": []}`:               "",
		`not json`:                                     "",
		`{"shop": 12, "products": []}`:                 "12",
		`{"shop": "` + strings.Repeat("x", 300) + `"}`: strings.Repeat("x", models.MaxReceiptShopNameLength),
	}
	for response, expected := range cases {
		if got := parseShopName(response); got != expected {
			t.Errorf("%.40s: expected %q, got %q", response, expected, got)
		}
	}
}

func TestAReadFillsTheShopAndMovesAToCheckReceiptToDone(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, false)

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, "Auchan"); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.ShopName != "Auchan" || stored.Status != models.RESOLVED || stored.ResolvedDate == nil {
		t.Errorf("expected shop Auchan, Done with a resolved date, got %q %s %v", stored.ShopName, stored.Status, stored.ResolvedDate)
	}
}

func TestAReadNeverOverwritesAPersonsShopOrReopensADoneReceipt(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, false)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).
		Updates(map[string]any{"shop_name": "Rewe", "status": models.DECLINED})
	receipt.ShopName = "Rewe"
	receipt.Status = models.DECLINED

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, "Auchan"); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.ShopName != "Rewe" || stored.Status != models.DECLINED {
		t.Errorf("a typed shop and a declined receipt should be left alone, got %q %s", stored.ShopName, stored.Status)
	}
}
