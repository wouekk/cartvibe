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

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, "Auchan", currencyContext{}, "", nil); err != nil {
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

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, "Auchan", currencyContext{}, "", nil); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.ShopName != "Rewe" || stored.Status != models.DECLINED {
		t.Errorf("a typed shop and a declined receipt should be left alone, got %q %s", stored.ShopName, stored.Status)
	}
}

func TestAReadRenamesAPlaceholderReceiptToTheShopButNeverATypedName(t *testing.T) {
	defer repositories.TruncateTestDb()
	service := NewReceiptProductExtractionService(nil)

	placeholder := seedExtractionReceipt(t, false)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", placeholder.ID).Update("name", "Receipt 20 Oct 2026")
	placeholder.Name = "Receipt 20 Oct 2026"
	if err := service.applyReadResult(placeholder, "Auchan", currencyContext{}, "", nil); err != nil {
		t.Fatal(err)
	}
	var renamed models.Receipt
	repositories.GetDB().First(&renamed, placeholder.ID)
	if renamed.Name != "Auchan" {
		t.Errorf("expected the placeholder name to become the shop, got %q", renamed.Name)
	}

	typed := seedExtractionReceipt(t, false)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", typed.ID).Update("name", "Birthday party")
	typed.Name = "Birthday party"
	if err := service.applyReadResult(typed, "Auchan", currencyContext{}, "", nil); err != nil {
		t.Fatal(err)
	}
	var kept models.Receipt
	repositories.GetDB().First(&kept, typed.ID)
	if kept.Name != "Birthday party" {
		t.Errorf("a typed name should be kept, got %q", kept.Name)
	}
}
