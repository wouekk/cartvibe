package repositories

import (
	"receipt-wrangler/api/internal/models"
	"testing"
)

func TestRenamingACategoryKeepsTheOldNameAsAnAliasAndMovesItsProducts(t *testing.T) {
	defer TruncateTestDb()

	CreateTestGroupWithUsers()
	category := models.Category{Name: "Sweets & Snacks"}
	GetDB().Create(&category)
	receipt := models.Receipt{Name: "r", GroupId: 1, PaidByUserID: 1}
	GetDB().Create(&receipt)
	product := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "CHIPS"}
	product.FoodGroup = "Sweets & Snacks"
	GetDB().Create(&product)
	other := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "LAIT"}
	other.FoodGroup = "Dairy"
	GetDB().Create(&other)

	updated, err := NewCategoryRepository(nil).UpdateCategory(models.Category{
		BaseModel: models.BaseModel{ID: category.ID}, Name: "Snacks", Description: "d", Skipped: true,
	}, "")
	if err != nil {
		t.Fatal(err)
	}
	if updated.Name != "Snacks" || updated.Aliases != "Sweets & Snacks" {
		t.Errorf("unexpected category after rename: %+v", updated)
	}

	var stored models.Category
	GetDB().First(&stored, category.ID)
	if !stored.Skipped || stored.Aliases != "Sweets & Snacks" {
		t.Errorf("the skip flag and alias should be stored: %+v", stored)
	}

	var moved, untouched models.ReceiptProduct
	GetDB().First(&moved, product.ID)
	GetDB().First(&untouched, other.ID)
	if moved.FoodGroup != "Snacks" || untouched.FoodGroup != "Dairy" {
		t.Errorf("only the renamed category's products should move, got %q and %q", moved.FoodGroup, untouched.FoodGroup)
	}

	// Renaming back drops the alias; a skip toggled off persists.
	back, _ := NewCategoryRepository(nil).UpdateCategory(models.Category{BaseModel: models.BaseModel{ID: category.ID}, Name: "Sweets & Snacks"}, "")
	if back.Aliases != "Snacks" {
		t.Errorf("expected the intermediate name as the alias, got %q", back.Aliases)
	}
	GetDB().First(&stored, category.ID)
	if stored.Skipped {
		t.Error("an update without the skip flag should switch it off")
	}
}

func TestCategoryAliasHelpers(t *testing.T) {
	aliases := AddCategoryAlias("", "Old")
	aliases = AddCategoryAlias(aliases, "old")
	aliases = AddCategoryAlias(aliases, "Older")
	if got := CategoryAliases(aliases); len(got) != 2 || got[0] != "Old" || got[1] != "Older" {
		t.Errorf("unexpected aliases %v", got)
	}
	if got := RemoveCategoryAlias(aliases, "OLD"); got != "Older" {
		t.Errorf("unexpected remaining aliases %q", got)
	}
}
