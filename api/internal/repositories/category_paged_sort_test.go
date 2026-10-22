package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"testing"
)

// The product count joins receipt_products, which has its own name column: sorting the categories
// by a bare "name" used to fail with "ambiguous column name: name".
func TestPagedCategoriesSortByNameAfterTheProductJoin(t *testing.T) {
	defer TruncateTestDb()

	CreateTestGroupWithUsers()
	GetDB().Create(&models.Category{Name: "Snacks"})
	GetDB().Create(&models.Category{Name: "Dairy"})
	receipt := models.Receipt{Name: "r", GroupId: 1, PaidByUserID: 1}
	GetDB().Create(&receipt)
	product := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "LAIT"}
	product.FoodGroup = "Dairy"
	GetDB().Create(&product)

	for _, orderBy := range []string{"name", "description", "numberOfReceipts", "numberOfProducts"} {
		categories, err := NewCategoryRepository(nil).GetAllPagedCategories(commands.PagedRequestCommand{
			Page: 1, PageSize: 10, OrderBy: orderBy, SortDirection: commands.ASCENDING,
		})
		if err != nil {
			t.Fatalf("sorting by %s: %v", orderBy, err)
		}
		if len(categories) != 2 {
			t.Fatalf("sorting by %s: expected 2 categories, got %d", orderBy, len(categories))
		}
	}

	byName, _ := NewCategoryRepository(nil).GetAllPagedCategories(commands.PagedRequestCommand{
		Page: 1, PageSize: 10, OrderBy: "name", SortDirection: commands.ASCENDING,
	})
	if byName[0].Name != "Dairy" || byName[0].NumberOfProducts != 1 {
		t.Errorf("expected Dairy with one product first, got %+v", byName[0])
	}
}
