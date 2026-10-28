package repositories

import (
	"strings"
	"testing"

	"cartvibe/api/internal/models"

	"gorm.io/gorm"
)

func categoryNames(t *testing.T) map[string]bool {
	t.Helper()
	var categories []models.Category
	if err := GetDB().Find(&categories).Error; err != nil {
		t.Fatal(err)
	}
	names := map[string]bool{}
	for _, category := range categories {
		names[category.Name] = true
	}
	return names
}

func TestStarterCategoriesHaveUniqueNames(t *testing.T) {
	names := map[string]bool{}
	for _, starter := range starterCategories {
		key := strings.ToLower(starter.name)
		if names[key] {
			t.Errorf("%q is listed twice", starter.name)
		}
		names[key] = true
		if starter.description == "" {
			t.Errorf("%s has no description", starter.name)
		}
	}
	// A covered name that is also a starter would keep that starter from ever being added next to it.
	for _, starter := range starterCategories {
		for _, covered := range starter.covers {
			if names[strings.ToLower(covered)] {
				t.Errorf("%s covers %q, which is a starter category itself", starter.name, covered)
			}
		}
	}
}

func TestSeedStarterCategoriesFillsAnEmptyList(t *testing.T) {
	defer TruncateTestDb()

	if err := GetDB().Transaction(seedStarterCategories); err != nil {
		t.Fatal(err)
	}

	names := categoryNames(t)
	if len(names) != len(starterCategories) {
		t.Fatalf("expected %d categories, got %d", len(starterCategories), len(names))
	}
	for _, wanted := range []string{"Restaurant", "Taxi", "Airlines", "Museum", "Highway Tolls", "Cinema", "Books", "Bills", "Alcohol", "Travel"} {
		if !names[wanted] {
			t.Errorf("missing %s", wanted)
		}
	}
}

func TestSeedStarterCategoriesKeepsTheHouseholdsOwn(t *testing.T) {
	defer TruncateTestDb()

	db := GetDB()
	// What the AI made on an existing install, in its own case, plus a renamed one.
	db.Create(&models.Category{Name: "fresh produce"})
	db.Create(&models.Category{Name: "Beverages"})
	db.Create(&models.Category{Name: "Taxis", Aliases: "Taxi"})
	db.Create(&models.Category{Name: "Meat & Fish"})

	if err := db.Transaction(seedStarterCategories); err != nil {
		t.Fatal(err)
	}

	names := categoryNames(t)
	for _, doubled := range []string{"Fresh Produce", "Drinks", "Taxi", "Meat", "Fish & Seafood"} {
		if names[doubled] {
			t.Errorf("%s should not be added next to the household's own", doubled)
		}
	}
	if !names["Airlines"] {
		t.Error("the rest of the list should still be added")
	}
	// Four of the household's own replace five starters ("Meat & Fish" covers two).
	if len(names) != len(starterCategories)-1 {
		t.Errorf("expected %d categories, got %d", len(starterCategories)-1, len(names))
	}
}

func TestStarterCategoriesRunOnceSoADeletedOneStaysDeleted(t *testing.T) {
	defer TruncateTestDb()
	withMigrations(t, []dataMigration{{name: starterCategoriesMigration, run: func(tx *gorm.DB) error {
		return seedStarterCategories(tx)
	}}})

	if err := RunDataMigrations(); err != nil {
		t.Fatal(err)
	}
	GetDB().Where("name = ?", "Museum").Delete(&models.Category{})

	if err := RunDataMigrations(); err != nil {
		t.Fatal(err)
	}
	names := categoryNames(t)
	if names["Museum"] {
		t.Error("a deleted starter category should stay deleted")
	}
	if len(names) != len(starterCategories)-1 {
		t.Errorf("expected %d categories, got %d", len(starterCategories)-1, len(names))
	}
}

func TestStarterCategoriesAreNotSeededIntoTestDatabases(t *testing.T) {
	defer TruncateTestDb()

	if err := GetDB().Transaction(runStarterCategoriesMigration); err != nil {
		t.Fatal(err)
	}
	if names := categoryNames(t); len(names) != 0 {
		t.Errorf("expected no categories in a test database, got %d", len(names))
	}
}
