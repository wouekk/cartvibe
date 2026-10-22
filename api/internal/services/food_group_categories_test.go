package services

import (
	"strings"
	"testing"

	"receipt-wrangler/api/internal/models"
	"receipt-wrangler/api/internal/repositories"
)

func TestResolveAddsNewCategoriesAndHonoursRenamesAndSkips(t *testing.T) {
	defer repositories.TruncateTestDb()

	db := repositories.GetDB()
	db.Create(&models.Category{Name: "Snacks", Aliases: "sweets & snacks"})
	db.Create(&models.Category{Name: "Household", Skipped: true})

	resolver, err := newFoodGroupResolver(nil)
	if err != nil {
		t.Fatal(err)
	}

	if got := resolver.Resolve("sweets & snacks"); got != "Snacks" {
		t.Errorf("an old name should land on the renamed category, got %q", got)
	}
	if got := resolver.Resolve("SNACKS"); got != "Snacks" {
		t.Errorf("matching ignores case, got %q", got)
	}
	if got := resolver.Resolve("household"); got != "" {
		t.Errorf("a switched-off category should resolve to Uncategorized, got %q", got)
	}
	if got := resolver.Resolve(""); got != "" {
		t.Errorf("empty stays empty, got %q", got)
	}

	if got := resolver.Resolve("fresh produce"); got != "Fresh Produce" {
		t.Errorf("an unknown category should be added in title case, got %q", got)
	}
	var stored models.Category
	if err := db.Where("name = ?", "Fresh Produce").First(&stored).Error; err != nil {
		t.Errorf("the new category should be in the Manage Categories list: %v", err)
	}
	// Resolving it again reuses it instead of adding a second.
	resolver.Resolve("Fresh produce")
	var count int64
	db.Model(&models.Category{}).Where("LOWER(name) = ?", "fresh produce").Count(&count)
	if count != 1 {
		t.Errorf("expected one Fresh Produce category, got %d", count)
	}
}

func TestPromptBlockListsAllowedRenamedAndSkippedCategories(t *testing.T) {
	defer repositories.TruncateTestDb()

	db := repositories.GetDB()
	db.Create(&models.Category{Name: "Dairy"})
	db.Create(&models.Category{Name: "Snacks", Aliases: "sweets & snacks"})
	db.Create(&models.Category{Name: "Household", Skipped: true})

	resolver, _ := newFoodGroupResolver(nil)
	block := resolver.PromptBlock()

	for _, expected := range []string{
		"Dairy, Snacks",
		`"Snacks" instead of "sweets & snacks"`,
		"Never use these categories, choose another one instead: Household",
	} {
		if !strings.Contains(block, expected) {
			t.Errorf("expected the block to contain %q, got:\n%s", expected, block)
		}
	}

	empty, _ := newFoodGroupResolver(nil)
	repositories.TruncateTestDb()
	empty, _ = newFoodGroupResolver(nil)
	if empty.PromptBlock() != "" {
		t.Error("an empty list should add nothing to the prompt")
	}
}

func TestProductExtractionReadsClassificationFromTheSameAnswer(t *testing.T) {
	response := `{"shop":"Auchan","products":[
		{"name":"CHIPS","displayName":"Crisps","amount":2.5,"health":"unhealthy","foodGroup":"Sweets & Snacks","seasonality":"maybe"},
		{"name":"LAIT","displayName":"Milk","amount":1.1,"health":"nonsense","foodGroup":"dairy"}]}`

	products, err := parseProductResponse(response)
	if err != nil {
		t.Fatal(err)
	}

	if products[0].Health != models.HEALTH_UNHEALTHY || products[0].FoodGroup != "sweets & snacks" || products[0].Seasonality != models.SEASONALITY_NOT_PRODUCE {
		t.Errorf("unexpected classification: %+v", products[0].FoodClassification)
	}
	if products[1].Health != "" || products[1].FoodGroup != "" {
		t.Errorf("an unusable health leaves the product for the sweep, got %+v", products[1].FoodClassification)
	}
}

func TestBuildProductExtractionPromptCarriesTheMonthCategoriesAndCorrections(t *testing.T) {
	prompt := buildProductExtractionPrompt(
		day("2026-10-01"), "Choose \"foodGroup\" from these categories: Dairy.", map[string]string{"dark chocolate": models.HEALTH_MEDIUM},
	)

	for _, expected := range []string{"October 2026", "Western Europe", "Choose \"foodGroup\" from these categories: Dairy.", "dark chocolate: MEDIUM", `"shop"`} {
		if !strings.Contains(prompt, expected) {
			t.Errorf("expected the prompt to contain %q", expected)
		}
	}
}

func TestProductPromptsOfferExampleCategoriesOnlyWithoutAList(t *testing.T) {
	withList := buildProductExtractionPrompt(day("2026-10-01"), "Choose \"foodGroup\" from these categories: Nabiał.", nil)
	if strings.Contains(withList, `"sweets & snacks"`) {
		t.Error("English example categories must not compete with the household's own list")
	}
	if !strings.Contains(withList, "from the list below") {
		t.Error("expected the food group to point at the list")
	}

	withoutList := buildProductExtractionPrompt(day("2026-10-01"), "", nil)
	if !strings.Contains(withoutList, `"sweets & snacks"`) {
		t.Error("a household without categories gets examples to start its list")
	}

	classification := buildClassificationPrompt(classificationBatch{month: day("2026-10-01")}, nil, "Choose \"foodGroup\" from these categories: Nabiał.")
	if strings.Contains(classification, `"sweets & snacks"`) || !strings.Contains(classification, "Nabiał") {
		t.Error("the classification prompt follows the same rule")
	}
}
