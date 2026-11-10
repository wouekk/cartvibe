package repositories

import (
	"cartvibe/api/internal/commands"
	"cartvibe/api/internal/models"
	"errors"
	"testing"
)

// The product count joins receipt_products, which has its own name column: sorting the categories
// by a bare "name" used to fail with "ambiguous column name: name".
func TestPagedCategoriesSortByNameAfterTheProductJoin(t *testing.T) {
	defer TruncateTestDb()

	CreateTestGroupWithUsers()
	GetDB().Create(&models.Category{Name: "Snacks"})
	dairy := models.Category{Name: "Dairy"}
	GetDB().Create(&dairy)
	receipt := models.Receipt{Name: "r", GroupId: 1, PaidByUserID: 1}
	GetDB().Create(&receipt)
	// Products are counted by category id (item-level categories).
	product := models.ReceiptProduct{ReceiptId: receipt.ID, Name: "LAIT", CategoryId: &dairy.ID}
	product.FoodGroup = "Dairy"
	GetDB().Create(&product)

	for _, orderBy := range []string{"name", "description", "numberOfReceipts", "numberOfProducts"} {
		categories, err := NewCategoryRepository(ImplicitCell(), nil).GetAllPagedCategories(commands.PagedRequestCommand{
			Page: 1, PageSize: 10, OrderBy: orderBy, SortDirection: commands.ASCENDING,
		})
		if err != nil {
			t.Fatalf("sorting by %s: %v", orderBy, err)
		}
		if len(categories) != 2 {
			t.Fatalf("sorting by %s: expected 2 categories, got %d", orderBy, len(categories))
		}
	}

	byName, _ := NewCategoryRepository(ImplicitCell(), nil).GetAllPagedCategories(commands.PagedRequestCommand{
		Page: 1, PageSize: 10, OrderBy: "name", SortDirection: commands.ASCENDING,
	})
	if byName[0].Name != "Dairy" || byName[0].NumberOfProducts != 1 {
		t.Errorf("expected Dairy with one product first, got %+v", byName[0])
	}
}

// The sort column comes from the request body. A value starting with a double quote used to be written into
// ORDER BY as raw SQL, which let a caller read any table through the sort order. Only the table's own columns pass.
func TestPagedCategoriesAndTagsRefuseASortColumnTheyDoNotOffer(t *testing.T) {
	defer TruncateTestDb()

	GetDB().Create(&models.Category{Name: "Dairy"})
	GetDB().Create(&models.Tag{Name: "Party"})

	for _, orderBy := range []string{
		`"NumberOfReceipts", (SELECT password FROM users LIMIT 1)`,
		`"x" ; DROP TABLE users`,
		`"NumberOfReceipts"`,
		"password",
		"users.password",
		"name; DROP TABLE users",
	} {
		command := commands.PagedRequestCommand{Page: 1, PageSize: 10, OrderBy: orderBy, SortDirection: commands.ASCENDING}

		if _, err := NewCategoryRepository(ImplicitCell(), nil).GetAllPagedCategories(command); !errors.Is(err, ErrInvalidSortColumn) {
			t.Errorf("categories sorted by %q: expected ErrInvalidSortColumn, got %v", orderBy, err)
		}
		if _, err := NewTagsRepository(ImplicitCell(), nil).GetAllPagedTags(command); !errors.Is(err, ErrInvalidSortColumn) {
			t.Errorf("tags sorted by %q: expected ErrInvalidSortColumn, got %v", orderBy, err)
		}
	}

	for _, orderBy := range []string{"", "id", "name", "description", "numberOfReceipts", "numberOfProducts"} {
		command := commands.PagedRequestCommand{Page: 1, PageSize: 10, OrderBy: orderBy, SortDirection: commands.DESCENDING}

		if tags, err := NewTagsRepository(ImplicitCell(), nil).GetAllPagedTags(command); err != nil || len(tags) != 1 {
			t.Errorf("tags sorted by %q: %v, %d rows", orderBy, err, len(tags))
		}
	}
}

// Sort writes a bare select alias as it is and nothing else: a quoted name with more behind it is quoted again by
// GORM, like any column name, so it can only fail as an unknown column.
func TestSortWritesOnlyABareAliasRaw(t *testing.T) {
	for orderBy, raw := range map[string]bool{
		`"NumberOfReceipts"`:                  true,
		`"NumberOfProducts"`:                  true,
		`"x", (SELECT 1)`:                     false,
		`"NumberOfReceipts" DESC, (SELECT 1)`: false,
		`name`:                                false,
		``:                                    false,
	} {
		if got := quotedSortAlias.MatchString(orderBy); got != raw {
			t.Errorf("%q: raw = %v, want %v", orderBy, got, raw)
		}
	}
}
