package repositories

import (
	"cartvibe/api/internal/models"
	"testing"
	"time"

	"github.com/shopspring/decimal"
)

func seedLabelMigrationReceipt(t *testing.T, tags []models.Tag, products ...models.ReceiptProduct) models.Receipt {
	t.Helper()
	receipt := models.Receipt{Name: "shop", Amount: decimal.RequireFromString("10"), Date: time.Now(), PaidByUserID: 1, GroupId: 1, Status: models.OPEN, Tags: tags}
	if err := GetDB().Omit("Tags.*").Create(&receipt).Error; err != nil {
		t.Fatal(err)
	}
	for i := range products {
		products[i].ReceiptId = receipt.ID
		if err := GetDB().Create(&products[i]).Error; err != nil {
			t.Fatal(err)
		}
	}
	return receipt
}

func productWithGroup(name string, foodGroup string) models.ReceiptProduct {
	product := models.ReceiptProduct{Name: name}
	product.FoodGroup = foodGroup
	return product
}

func TestItemLevelLabelsMigrationBackfillsCategoryIdsAndCopiesReceiptTags(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroupWithUsers()

	// Non-ASCII names and an old name (alias): SQLite's LOWER() would miss both.
	slimaki := models.Category{Name: "Ślimaki"}
	dairy := models.Category{Name: "Dairy", Aliases: "Milk products"}
	party := models.Tag{Name: "Party"}
	for _, row := range []any{&slimaki, &dairy, &party} {
		if err := GetDB().Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}

	seedLabelMigrationReceipt(t, []models.Tag{party},
		productWithGroup("a", "ślimaki"),
		productWithGroup("b", "milk products"),
		productWithGroup("c", "Gone category"),
		productWithGroup("d", ""),
	)
	untagged := seedLabelMigrationReceipt(t, nil, productWithGroup("e", "Dairy"))

	if err := itemLevelCategoriesAndTags(GetDB()); err != nil {
		t.Fatal(err)
	}

	products := []models.ReceiptProduct{}
	GetDB().Preload("Tags").Order("name").Find(&products)
	want := map[string]*uint{"a": &slimaki.ID, "b": &dairy.ID, "c": nil, "d": nil, "e": &dairy.ID}
	for _, product := range products {
		expected := want[product.Name]
		if (expected == nil) != (product.CategoryId == nil) || (expected != nil && *expected != *product.CategoryId) {
			t.Errorf("%s: expected category %v, got %v", product.Name, expected, product.CategoryId)
		}
		tagged := len(product.Tags) == 1 && product.Tags[0].ID == party.ID
		if product.ReceiptId == untagged.ID && len(product.Tags) != 0 {
			t.Errorf("%s: a line of an untagged receipt got tags %+v", product.Name, product.Tags)
		}
		if product.ReceiptId != untagged.ID && !tagged {
			t.Errorf("%s: expected the receipt's Party tag, got %+v", product.Name, product.Tags)
		}
	}

	// Running again changes nothing (the ledger normally prevents it, the query guards it as well).
	if err := itemLevelCategoriesAndTags(GetDB()); err != nil {
		t.Fatal(err)
	}
	var links int64
	GetDB().Table("receipt_product_tags").Count(&links)
	if links != 4 {
		t.Errorf("expected 4 tag links, got %d", links)
	}
}

func TestReadingAgainKeepsWhatPeopleSetOnTheLines(t *testing.T) {
	defer TruncateTestDb()
	CreateTestGroupWithUsers()

	sweets := models.Category{Name: "Sweets"}
	snacks := models.Category{Name: "Snacks"}
	party := models.Tag{Name: "Party"}
	for _, row := range []any{&sweets, &snacks, &party} {
		if err := GetDB().Create(row).Error; err != nil {
			t.Fatal(err)
		}
	}

	chosen := models.ReceiptProduct{Name: "CHOCO 100G", DisplayName: "Chocolate", CategoryId: &sweets.ID, CategoryOverridden: true, Tags: []models.Tag{party}}
	chosen.FoodGroup = sweets.Name
	receipt := seedLabelMigrationReceipt(t, nil, chosen)

	// The AI reads the line again and files it under Snacks; the person's Sweets and Party stay.
	reread := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "CHOCO 100G", DisplayName: "Dark chocolate", CategoryId: &snacks.ID}
	reread.FoodGroup = snacks.Name
	fresh := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "BREAD", DisplayName: "Bread"}
	if err := NewReceiptProductRepository(nil).ReplaceProducts(receipt.ID, []models.ReceiptProduct{reread, fresh}); err != nil {
		t.Fatal(err)
	}

	products, _, err := NewReceiptProductRepository(nil).GetReceiptProducts(receipt.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(products) != 2 {
		t.Fatalf("expected 2 products, got %d", len(products))
	}
	choco := products[0]
	if choco.CategoryId == nil || *choco.CategoryId != sweets.ID || !choco.CategoryOverridden || len(choco.Tags) != 1 {
		t.Errorf("the person's category and tag should survive the re-read: %+v", choco)
	}
	if bread := products[1]; len(bread.Tags) != 0 || bread.CategoryId != nil {
		t.Errorf("a new line starts without labels: %+v", bread)
	}
}
