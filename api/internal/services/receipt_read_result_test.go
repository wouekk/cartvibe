package services

import (
	"cartvibe/api/internal/models"
	"cartvibe/api/internal/repositories"
	"strings"
	"testing"

	"github.com/shopspring/decimal"
)

func TestAReadKeepsAStatusAPersonChangedWhileTheAiWasReading(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, false)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("status", models.NEEDS_ATTENTION)
	receipt.Status = models.NEEDS_ATTENTION

	// The read started while the receipt was OPEN.
	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, models.OPEN, "Auchan", currencyContext{}, "", nil); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.Status != models.NEEDS_ATTENTION {
		t.Errorf("a status set during the read should be kept, got %s", stored.Status)
	}
}

func TestAReadLeavesAReceiptWithoutATotalToCheck(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, false)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", receipt.ID).Update("amount", decimal.Zero)
	receipt.Amount = decimal.Zero

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, receipt.Status, "Auchan", currencyContext{}, "", nil); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, receipt.ID)
	if stored.Status != models.OPEN {
		t.Errorf("a receipt with no total still needs a person, got %s", stored.Status)
	}
}

// applyProducts decides from the receipt as stored when the read lands, not the copy read before the AI call.
func TestApplyProductsDecidesFromTheReceiptAsItIsNow(t *testing.T) {
	defer repositories.TruncateTestDb()
	before := seedExtractionReceipt(t, false)
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", before.ID).Update("name", "Receipt 20 Oct 2026")
	if err := repositories.NewReceiptProductRepository(repositories.ImplicitCell(), nil).MarkReceiptProductsPending(before.ID); err != nil {
		t.Fatalf("queue: %v", err)
	}

	// While the AI reads: a person names the receipt and declines it.
	repositories.GetDB().Model(&models.Receipt{}).Where("id = ?", before.ID).
		Updates(map[string]any{"name": "Birthday party", "status": models.DECLINED})

	resolver, err := newFoodGroupResolver(nil)
	if err != nil {
		t.Fatal(err)
	}
	amount := decimal.RequireFromString("12.50")
	products := []models.ReceiptProduct{{Name: "MILK", Amount: &amount}}
	if err := NewReceiptProductExtractionService(nil).applyProducts(before.ID, models.OPEN, products, "Auchan", "", resolver, map[string]string{}); err != nil {
		t.Fatal(err)
	}

	var stored models.Receipt
	repositories.GetDB().First(&stored, before.ID)
	if stored.Name != "Birthday party" || stored.Status != models.DECLINED {
		t.Errorf("the person's edits should survive the read, got %q %s", stored.Name, stored.Status)
	}
	if stored.ShopName != "Auchan" {
		t.Errorf("the shop should still be filled in, got %q", stored.ShopName)
	}
	var count int64
	repositories.GetDB().Model(&models.ReceiptProduct{}).Where("receipt_id = ?", before.ID).Count(&count)
	if count != 1 {
		t.Errorf("expected the product stored, got %d", count)
	}
}

func TestApplyProductsForAReceiptDeletedDuringTheReadStoresNothing(t *testing.T) {
	defer repositories.TruncateTestDb()
	receipt := seedExtractionReceipt(t, false)
	repositories.GetDB().Delete(&models.Receipt{}, receipt.ID)

	resolver, err := newFoodGroupResolver(nil)
	if err != nil {
		t.Fatal(err)
	}
	products := []models.ReceiptProduct{{Name: "MILK"}}
	if err := NewReceiptProductExtractionService(nil).applyProducts(receipt.ID, models.OPEN, products, "", "", resolver, map[string]string{}); err != nil {
		t.Fatal(err)
	}

	var count int64
	repositories.GetDB().Model(&models.ReceiptProduct{}).Where("receipt_id = ?", receipt.ID).Count(&count)
	if count != 0 {
		t.Errorf("expected no products for a deleted receipt, got %d", count)
	}
}

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

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, receipt.Status, "Auchan", currencyContext{}, "", nil); err != nil {
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

	if err := NewReceiptProductExtractionService(nil).applyReadResult(receipt, receipt.Status, "Auchan", currencyContext{}, "", nil); err != nil {
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
	if err := service.applyReadResult(placeholder, placeholder.Status, "Auchan", currencyContext{}, "", nil); err != nil {
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
	if err := service.applyReadResult(typed, typed.Status, "Auchan", currencyContext{}, "", nil); err != nil {
		t.Fatal(err)
	}
	var kept models.Receipt
	repositories.GetDB().First(&kept, typed.ID)
	if kept.Name != "Birthday party" {
		t.Errorf("a typed name should be kept, got %q", kept.Name)
	}
}
